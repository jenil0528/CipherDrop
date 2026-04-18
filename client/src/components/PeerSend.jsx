import { useState, useRef, useCallback, useEffect } from 'react';
import { Wifi, Copy, CheckCircle, AlertCircle, Loader, Users, Link2, KeyRound } from 'lucide-react';
import { encryptFile, formatFileSize } from '../utils/crypto';
import { createRoom, getSocket, startOffer, sendFileData, ICE_SERVERS_CONFIG } from '../utils/peer';

export default function PeerSend({ encryption }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, creating, encrypting, ready, error
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyMode, setKeyMode] = useState('in-url'); 
  const [sharedKey, setSharedKey] = useState('');
  const [isUnlimited, setIsUnlimited] = useState(true); // Default to true to encourage multi-user connectivity
  
  // Track state of multiple active connected peers
  const [activePeers, setActivePeers] = useState({});

  const fileInputRef = useRef(null);
  
  // Ref map tracking active connections internally: { [peerId]: { pc, dc, pendingCandidates } }
  const peersRef = useRef(new Map());
  const encryptedBlobRef = useRef(null);
  const encResultRef = useRef(null);

  useEffect(() => {
    return () => {
      reset();
    };
  }, []);

  const triggerIceRestart = async (peerId) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || !roomId) return;
    console.warn(`[P2P] Watchdog: Connection hanging for ${peerId}. Triggering ICE Restart...`);
    try {
      await startOffer(peer.pc, roomId, peerId, { iceRestart: true });
    } catch (err) {
      console.error('[P2P] ICE Restart failed:', err);
    }
  };

  const updatePeerState = useCallback((peerId, updates) => {
      setActivePeers(prev => ({
          ...prev,
          [peerId]: { ...prev[peerId], ...updates }
      }));
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError('');
    }
  }, []);

  const startSharing = async () => {
    if (!file) return;

    try {
      setStatus('encrypting');
      
      const encResult = await encryptFile(file, encryption);
      encResultRef.current = encResult;
      encryptedBlobRef.current = await encResult.encryptedBlob.arrayBuffer();
      setSharedKey(encResult.keyBase64);

      setStatus('creating');
      const room = await createRoom();
      setRoomId(room);
      setStatus('ready');

      const socket = getSocket();

      if (isUnlimited) {
        socket.emit('set-unlimited-room', room);
      }

      socket.off('peer-joined');
      socket.off('signal-ready');
      socket.off('signal-answer');
      socket.off('signal-ice-candidate');
      socket.off('peer-disconnected');

      socket.on('peer-joined', ({ peerId }) => {
        console.log(`Peer joined room: ${peerId}, waiting for ready signal...`);
      });

      socket.on('signal-ready', async ({ from }) => {
        console.log(`Peer requested connection: ${from}`);
        setupPeerConnection(from, room, socket);
      });

      socket.on('signal-answer', async ({ from, answer }) => {
        const peer = peersRef.current.get(from);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
          while (peer.pendingCandidates.length > 0) {
            const cand = peer.pendingCandidates.shift();
            await peer.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.error(e));
          }
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      });

      socket.on('signal-ice-candidate', async ({ from, candidate }) => {
        if (!candidate) return;
        const peer = peersRef.current.get(from);
        if (!peer) return;
        try {
          if (peer.pc.remoteDescription) {
            await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            peer.pendingCandidates.push(candidate);
          }
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      });

      socket.on('peer-disconnected', ({ peerId }) => {
        console.log(`Peer disconnected: ${peerId}`);
        const peer = peersRef.current.get(peerId);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(peerId);
          setActivePeers(prev => {
            const next = { ...prev };
            if (next[peerId] && next[peerId].state !== 'done') {
                next[peerId].state = 'error';
                next[peerId].errorMsg = 'Peer disconnected prematurely';
            }
            return next;
          });
        }
      });

    } catch (err) {
      console.error('P2P Setup Error:', err);
      setError(err.message);
      setStatus('error');
    }
  };

  const setupPeerConnection = async (peerId, room, socket) => {
      const pc = new RTCPeerConnection(ICE_SERVERS_CONFIG);
      const dc = pc.createDataChannel('fileTransfer', { ordered: true });
      
      peersRef.current.set(peerId, { pc, dc, pendingCandidates: [] });
      updatePeerState(peerId, { id: peerId, state: 'connecting', progress: 0 });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal-ice-candidate', { roomId: room, candidate: event.candidate, target: peerId });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'disconnected') {
             triggerIceRestart(peerId);
             setTimeout(() => {
                 if (pc.connectionState !== 'connected') {
                     updatePeerState(peerId, { state: 'error', errorMsg: 'Connection blocked by network/firewall.' });
                 }
             }, 10000);
        }
      };

      dc.onopen = async () => {
          updatePeerState(peerId, { state: 'sending' });
          const encResult = encResultRef.current;
          
          socket.emit('file-meta', {
            roomId: room,
            target: peerId,
            meta: {
              originalName: file.name,
              mimeType: file.type,
              originalSize: file.size,
              encryptedSize: encResult.encryptedBlob.size,
              encryptionType: encryption,
              keyBase64: keyMode === 'in-url' ? encResult.keyBase64 : null,
              iv: encResult.iv,
              sha256Hash: encResult.sha256Hash,
              keyIncluded: keyMode === 'in-url'
            }
          });

          try {
              await sendFileData(dc, encryptedBlobRef.current, (p) => {
                  updatePeerState(peerId, { progress: Math.round(p * 100) });
              });
              updatePeerState(peerId, { state: 'done', progress: 100 });
              socket.emit('transfer-complete', { roomId: room, target: peerId });
          } catch(err) {
              updatePeerState(peerId, { state: 'error', errorMsg: 'Transfer interrupted.' });
          }
      };

      // Watchdog: If data channel doesn't open within 15s after handshake starts
      setTimeout(() => {
        if (pc.connectionState !== 'connected' && pc.connectionState !== 'completed') {
          triggerIceRestart(peerId);
        }
      }, 15000);

      await startOffer(pc, room, peerId);
  };

  const copyRoomId = () => {
    const link = `${window.location.origin}/receive/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyKey = () => {
    navigator.clipboard.writeText(sharedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const reset = () => {
    for (let [_, peer] of peersRef.current) {
        peer.pc.close();
    }
    peersRef.current.clear();
    const socket = getSocket();
    socket.off('peer-joined');
    socket.off('signal-ready');
    socket.off('signal-answer');
    socket.off('signal-ice-candidate');
    socket.off('peer-disconnected');
    
    setFile(null);
    setStatus('idle');
    setRoomId('');
    setError('');
    setSharedKey('');
    setActivePeers({});
    encryptedBlobRef.current = null;
    encResultRef.current = null;
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
      mp4: '🎬', avi: '🎬', mov: '🎬',
      mp3: '🎵', wav: '🎵',
      zip: '📦', rar: '📦',
    };
    return icons[ext] || '📎';
  };

  return (
    <div className="peer-send-container">
      <h3 className="section-title">
        <Wifi size={20} />
        P2P Send Mesh
      </h3>

      {!file ? (
        <div
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => {
              if (e.target.files[0]) {
                setFile(e.target.files[0]);
                setError('');
              }
            }}
            style={{ display: 'none' }}
          />
          <div className="drop-zone-content">
            <div className="drop-icon p2p-drop">
              <Wifi size={48} />
            </div>
            <p className="drop-title">Drop your file here</p>
            <p className="drop-subtitle">or click to browse • Support multi-user concurrent push</p>
          </div>
        </div>
      ) : (
        <div className="file-selected">
          <div className="file-info-card">
            <span className="file-emoji">{getFileIcon(file.name)}</span>
            <div className="file-details">
              <p className="file-name">{file.name}</p>
              <p className="file-size">{formatFileSize(file.size)}</p>
            </div>
            {status === 'idle' && (
              <button className="btn-remove" onClick={reset}>✕</button>
            )}
          </div>

          {status === 'idle' && (
            <>
              <div className="key-mode-selector">
                <div className="key-mode-header">
                  <KeyRound size={16} />
                  <span>Key Sharing Mode</span>
                </div>
                <div className="key-mode-options">
                  <button
                    className={`key-mode-card ${keyMode === 'in-url' ? 'active' : ''}`}
                    onClick={() => setKeyMode('in-url')}
                  >
                    <div className="key-mode-icon">
                      <Link2 size={20} />
                    </div>
                    <div className="key-mode-info">
                      <h5>Auto Key</h5>
                      <p>Key sent automatically with the file transfer.</p>
                    </div>
                    <div className="key-mode-check">
                      {keyMode === 'in-url' && <CheckCircle size={18} />}
                    </div>
                  </button>
                  <button
                    className={`key-mode-card ${keyMode === 'separate' ? 'active' : ''}`}
                    onClick={() => setKeyMode('separate')}
                  >
                    <div className="key-mode-icon separate-icon">
                      <KeyRound size={20} />
                    </div>
                    <div className="key-mode-info">
                      <h5>Manual Key</h5>
                      <p>Receiver must enter key manually for max security.</p>
                    </div>
                    <div className="key-mode-check">
                      {keyMode === 'separate' && <CheckCircle size={18} />}
                    </div>
                  </button>
                </div>
              </div>

              <div className="p2p-options-row">
                <label className="p2p-toggle">
                  <input 
                    type="checkbox" 
                    checked={isUnlimited} 
                    onChange={(e) => setIsUnlimited(e.target.checked)} 
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label">
                    <span>Unlimited Connections</span>
                    <p>Allows multiple users to download simultaneously</p>
                  </div>
                </label>
              </div>

              <button className="btn-primary btn-p2p" onClick={startSharing}>
                <Wifi size={18} />
                Start Mesh Session
              </button>
            </>
          )}

          {status === 'creating' && (
            <div className="status-section">
              <Loader size={24} className="spin" />
              <p>Creating secure hub...</p>
            </div>
          )}

          {status === 'encrypting' && (
            <div className="status-section">
              <Loader size={24} className="spin" />
              <p>Encrypting file for broadcast...</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="waiting-section">
              <div className="room-code">
                <p className="room-label">Share this link with receivers:</p>
                <div className="room-id-display">
                  <span className="room-id">{roomId}</span>
                  <button className="btn-copy" onClick={copyRoomId}>
                    {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
                
                {keyMode === 'separate' && sharedKey && (
                  <div style={{marginTop: '15px'}} className="share-key-box p2p-key-box">
                    <div className="share-key-header">
                      <KeyRound size={16} />
                      <p className="share-label">Decryption Key (share separately):</p>
                    </div>
                    <div className="share-link-input">
                      <input type="text" value={sharedKey} readOnly className="key-input-field" />
                      <button className="btn-copy btn-copy-key" onClick={copyKey}>
                        {copiedKey ? <CheckCircle size={16} /> : <Copy size={16} />}
                        {copiedKey ? 'Copied!' : 'Copy Key'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="waiting-animation">
                <Users size={32} />
                <p>Mesh hub active. Waiting for receivers to join...</p>
                <div className="pulse-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>

              {Object.keys(activePeers).length > 0 && (
                 <div className="active-peers-container" style={{ marginTop: '30px', textAlign: 'left' }}>
                     <h4 style={{marginBottom: '15px', color: '#ffb347', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Users size={18} /> Concurrent Receivers ({Object.keys(activePeers).length})
                     </h4>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                         {Object.values(activePeers).map(peer => (
                             <div key={peer.id} className="peer-card" style={{ padding: '15px', background: 'rgba(255,179,71,0.05)', border: '1px solid rgba(255,179,71,0.2)', borderRadius: '12px' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', color: '#e0e0e0' }}>
                                     <span style={{fontFamily: 'monospace'}}>ID: {peer.id.substring(0,8)}</span>
                                     <span style={{ 
                                         textTransform: 'capitalize', 
                                         fontWeight: 600,
                                         color: peer.state === 'done' ? '#4caf50' : peer.state === 'error' ? '#f44336' : '#ffb347'
                                     }}>
                                         {peer.state === 'error' ? 'Failed' : peer.state}
                                     </span>
                                 </div>
                                 <div className="progress-bar" style={{height: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px'}}>
                                    <div className="progress-fill p2p-fill" style={{ width: `${peer.progress}%`, borderRadius: '3px' }}></div>
                                 </div>
                                 {peer.errorMsg && <p style={{color: '#f44336', fontSize:'0.8rem', marginTop: '8px'}}>{peer.errorMsg}</p>}
                             </div>
                         ))}
                     </div>
                 </div>
              )}
              
              {Object.values(activePeers).length > 0 && Object.values(activePeers).every(p => p.state === 'done' || p.state === 'error') && (
                 <div style={{marginTop: '20px'}}>
                     <button className="btn-secondary" onClick={reset}>Close Hub & Send Another</button>
                 </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="error-section">
              <AlertCircle size={24} />
              <p>{error}</p>
              <div className="error-actions">
                <button className="btn-primary" onClick={reset}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
