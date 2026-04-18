import { useState, useRef, useCallback } from 'react';
import { Upload, Wifi, Copy, CheckCircle, AlertCircle, Loader, Users, Link2, KeyRound } from 'lucide-react';
import { encryptFile, formatFileSize } from '../utils/crypto';
import { createRoom, getSocket, createSenderPeer, startOffer, sendFileData } from '../utils/peer';

export default function PeerSend({ encryption }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, creating, waiting, connected, encrypting, sending, done, error
  const [roomId, setRoomId] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyMode, setKeyMode] = useState('in-url'); // 'in-url' or 'separate'
  const [sharedKey, setSharedKey] = useState('');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const fileInputRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);

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
      setStatus('creating');
      const room = await createRoom();
      setRoomId(room);
      setStatus('waiting');

      const socket = getSocket();

      // If unlimited mode is on, tell the server to skip the 1-hour cleanup
      if (isUnlimited) {
        socket.emit('set-unlimited-room', room);
      }

      // Wait for receiver to join AND be ready (handshake)
      socket.off('peer-joined');
      socket.off('signal-ready');

      socket.on('peer-joined', () => {
        console.log('Peer joined room, waiting for ready signal...');
      });

      socket.on('signal-ready', async () => {
        try {
          setStatus('connected');

          // Create WebRTC connection
          const { pc, dataChannel } = createSenderPeer(room);
          pcRef.current = pc;
          dcRef.current = dataChannel;

          dataChannel.onopen = async () => {
            try {
              // Encrypt
              setStatus('encrypting');
              const encResult = await encryptFile(file, encryption);

              // Save key for separate sharing if needed
              setSharedKey(encResult.keyBase64);

              // Send metadata through signaling
              // Include key in metadata only if key mode is 'in-url'
              socket.emit('file-meta', {
                roomId: room,
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

              // Send encrypted data
              setStatus('sending');
              const encData = await encResult.encryptedBlob.arrayBuffer();
              await sendFileData(dataChannel, encData, (p) => setProgress(Math.round(p * 100)));

              setStatus('done');
            } catch (err) {
              console.error('P2P Error:', err);
              setError(err.message);
              setStatus('error');
            }
          };

          // Handle state changes
          pc.onconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.connectionState);
            if (pc.connectionState === 'failed') {
              setError('Connection failed. This usually happens due to restrictive firewalls.');
              setStatus('error');
            }
          };

          // Create offer
          await startOffer(pc, room);
        } catch (err) {
          console.error('P2P Setup Error:', err);
          setError(err.message);
          setStatus('error');
        }
      });

      socket.off('peer-disconnected');
      socket.on('peer-disconnected', () => {
        if (status !== 'done') {
          setError('Peer disconnected before transfer finished.');
          setStatus('error');
        }
      });

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
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
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setFile(null);
    setStatus('idle');
    setRoomId('');
    setProgress(0);
    setError('');
    setSharedKey('');
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
        P2P Send
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
            <p className="drop-subtitle">or click to browse • No size limit in P2P mode</p>
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
              {/* Key Sharing Mode Selector */}
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

              <button className="btn-primary btn-p2p" onClick={startSharing}>
                <Wifi size={18} />
                Start P2P Session
              </button>

              <div className="p2p-options-row">
                <label className="p2p-toggle">
                  <input 
                    type="checkbox" 
                    checked={isUnlimited} 
                    onChange={(e) => setIsUnlimited(e.target.checked)} 
                  />
                  <span className="toggle-slider"></span>
                  <div className="toggle-label">
                    <span>Unlimited Session</span>
                    <p>Room stays active until you close this tab</p>
                  </div>
                </label>
              </div>
            </>
          )}

          {status === 'creating' && (
            <div className="status-section">
              <Loader size={24} className="spin" />
              <p>Creating secure room...</p>
            </div>
          )}

          {status === 'waiting' && (
            <div className="waiting-section">
              <div className="room-code">
                <p className="room-label">Share this link with the receiver:</p>
                <div className="room-id-display">
                  <span className="room-id">{roomId}</span>
                  <button className="btn-copy" onClick={copyRoomId}>
                    {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
                {keyMode === 'separate' && (
                  <p className="room-key-note">
                    <KeyRound size={14} />
                    Key will be shown after transfer completes. Share it separately.
                  </p>
                )}
              </div>
              <div className="waiting-animation">
                <Users size={32} />
                <p>Waiting for receiver to join...</p>
                <div className="pulse-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          {status === 'connected' && (
            <div className="status-section connected">
              <CheckCircle size={24} />
              <p>Peer connected! Establishing secure channel...</p>
            </div>
          )}

          {status === 'encrypting' && (
            <div className="status-section">
              <Loader size={24} className="spin" />
              <p>Encrypting file...</p>
            </div>
          )}

          {status === 'sending' && (
            <div className="progress-section">
              <div className="progress-bar">
                <div className="progress-fill p2p-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="progress-text">
                Sending encrypted data... {progress}%
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="success-section">
              <CheckCircle size={48} />
              <h3>Transfer Complete!</h3>
              <p>File sent securely via P2P connection.</p>

              {/* Show key for separate sharing */}
              {keyMode === 'separate' && sharedKey && (
                <div className="share-key-box p2p-key-box">
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
                  <p className="share-note share-note-key">
                    🔑 The receiver needs this key to decrypt the file. Share it through a different channel.
                  </p>
                </div>
              )}

              <button className="btn-secondary" onClick={reset}>Send Another File</button>
            </div>
          )}

          {status === 'error' && (
            <div className="error-section">
              <AlertCircle size={24} />
              <p>{error}</p>
              <button className="btn-secondary" onClick={reset}>Try Again</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
