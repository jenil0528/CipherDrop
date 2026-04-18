import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Wifi, CheckCircle, AlertCircle, Loader, ShieldCheck, Hash, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import { decryptFile, formatFileSize } from '../utils/crypto';
import { joinRoom, getSocket, createReceiverPeer, receiveFileData } from '../utils/peer';
import { saveAs } from 'file-saver';

export default function PeerReceive() {
  const { roomId: urlRoomId } = useParams();
  const [roomId, setRoomId] = useState(urlRoomId || '');
  const [status, setStatus] = useState(urlRoomId ? 'joining' : 'idle'); // idle, joining, waiting, receiving, needsKey, decrypting, done, error
  const [fileMeta, setFileMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [encryptedBuffer, setEncryptedBuffer] = useState(null);
  const pcRef = useRef(null);
  const metaRef = useRef(null);

  useEffect(() => {
    if (urlRoomId) {
      handleJoin(urlRoomId);
    }
  }, [urlRoomId]);

  const handleJoin = async (id) => {
    const targetRoomId = id || roomId;
    if (!targetRoomId) return;

    try {
      setStatus('joining');
      await joinRoom(targetRoomId);
      setStatus('waiting');

      const socket = getSocket();
      const { pc } = createReceiverPeer(targetRoomId);
      pcRef.current = pc;

      // Receive file metadata
      socket.off('file-meta');
      socket.on('file-meta', ({ meta }) => {
        setFileMeta(meta);
        metaRef.current = meta;
      });

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log('Receiver ICE State:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setError('WebRTC connection failed. This may be due to a restrictive network.');
          setStatus('error');
        }
      };

      // Handle data channel
      pc.ondatachannel = async (event) => {
        const dataChannel = event.channel;
        
        dataChannel.onopen = () => {
          setStatus('receiving');
        };

        // Wait for binary data
        dataChannel.binaryType = 'arraybuffer';

        const meta = metaRef.current;
        const encryptedData = await receiveFileData(
          dataChannel,
          meta?.encryptedSize || 0,
          (p) => setProgress(Math.round(p * 100))
        );

        const currentMeta = metaRef.current;
        if (!currentMeta) {
          setError('No file metadata received');
          setStatus('error');
          return;
        }

        // Check if key was included in metadata
        if (!currentMeta.keyBase64 || currentMeta.keyIncluded === false) {
          // Key not included — need manual entry
          setEncryptedBuffer(encryptedData);
          setStatus('needsKey');
          return;
        }

        // Key included — auto-decrypt
        try {
          setStatus('decrypting');
          const decryptedData = await decryptFile(
            encryptedData,
            currentMeta.keyBase64,
            currentMeta.iv,
            currentMeta.sha256Hash
          );

          // Save file
          const blob = new Blob([decryptedData], { type: currentMeta.mimeType || 'application/octet-stream' });
          saveAs(blob, currentMeta.originalName || 'received_file');
          
          setStatus('done');
        } catch (err) {
          setError(err.message);
          setStatus('error');
        }
      };

      socket.off('peer-disconnected');
      socket.on('peer-disconnected', () => {
        if (status !== 'done') {
          setError('Sender disconnected. Connection lost.');
          setStatus('error');
        }
      });

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleManualDecrypt = async () => {
    if (!manualKey.trim() || !encryptedBuffer) return;

    const currentMeta = metaRef.current;
    if (!currentMeta) {
      setError('No file metadata');
      setStatus('error');
      return;
    }

    try {
      setStatus('decrypting');
      const decryptedData = await decryptFile(
        encryptedBuffer,
        manualKey.trim(),
        currentMeta.iv,
        currentMeta.sha256Hash
      );

      const blob = new Blob([decryptedData], { type: currentMeta.mimeType || 'application/octet-stream' });
      saveAs(blob, currentMeta.originalName || 'received_file');
      
      setStatus('done');
    } catch (err) {
      setError('Decryption failed. Please check that the key is correct.');
      setStatus('needsKey');
    }
  };

  const reset = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setStatus('idle');
    setRoomId('');
    setFileMeta(null);
    setProgress(0);
    setError('');
    setManualKey('');
    setEncryptedBuffer(null);
  };

  return (
    <div className="download-page">
      <div className="download-container">
        <div className="download-header p2p-header">
          <div className="download-icon p2p-icon-large">
            <Wifi size={40} />
          </div>
          <h2>P2P File Receive</h2>
          <p>Receive files directly from another peer via encrypted WebRTC connection.</p>
        </div>

        {status === 'idle' && (
          <div className="join-section">
            <label className="join-label">Enter Room Code:</label>
            <div className="join-input-group">
              <input
                type="text"
                className="join-input"
                placeholder="e.g. ABC123"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button className="btn-primary" onClick={() => handleJoin()} disabled={roomId.length !== 6}>
                Join Room
              </button>
            </div>
          </div>
        )}

        {status === 'joining' && (
          <div className="loading-section">
            <Loader size={32} className="spin" />
            <p>Joining room {roomId}...</p>
          </div>
        )}

        {status === 'waiting' && (
          <div className="loading-section">
            <Loader size={32} className="spin" />
            <p>Connected to room! Waiting for sender to initiate transfer...</p>
            {fileMeta && (
              <div className="file-info-download">
                <div className="info-row">
                  <span className="info-label">File Name</span>
                  <span className="info-value">{fileMeta.originalName}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Size</span>
                  <span className="info-value">{formatFileSize(fileMeta.originalSize)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Encryption</span>
                  <span className="info-value encryption-badge">
                    {fileMeta.encryptionType === 'SHA' ? (
                      <><Hash size={14} /> SHA-256 + AES</>
                    ) : (
                      <><Lock size={14} /> AES-256-GCM</>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {status === 'receiving' && (
          <div className="progress-section">
            <div className="progress-bar">
              <div className="progress-fill p2p-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-text">
              Receiving encrypted data... {progress}%
            </p>
            {fileMeta && (
              <p className="file-transfer-info">
                {fileMeta.originalName} • {formatFileSize(fileMeta.originalSize)}
              </p>
            )}
          </div>
        )}

        {status === 'needsKey' && (
          <div className="manual-key-section-p2p">
            <div className="success-badge">
              <CheckCircle size={20} />
              File received successfully!
            </div>

            {fileMeta && (
              <div className="file-info-download">
                <div className="info-row">
                  <span className="info-label">File Name</span>
                  <span className="info-value">{fileMeta.originalName}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Size</span>
                  <span className="info-value">{formatFileSize(fileMeta.originalSize)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Encryption</span>
                  <span className="info-value encryption-badge">
                    {fileMeta.encryptionType === 'SHA' ? (
                      <><Hash size={14} /> SHA-256 + AES</>
                    ) : (
                      <><Lock size={14} /> AES-256-GCM</>
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="manual-key-section">
              <div className="manual-key-header">
                <div className="manual-key-icon">
                  <KeyRound size={24} />
                </div>
                <div>
                  <h4>Decryption Key Required</h4>
                  <p>The sender chose to share the key separately. Ask them for the decryption key and paste it below.</p>
                </div>
              </div>
              <div className="manual-key-input-group">
                <div className="manual-key-input-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="manual-key-input"
                    placeholder="Paste decryption key here..."
                    value={manualKey}
                    onChange={(e) => { setManualKey(e.target.value); setError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualDecrypt()}
                  />
                  <button
                    className="btn-toggle-key"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && (
                  <p className="manual-key-error">
                    <AlertCircle size={14} />
                    {error}
                  </p>
                )}
                <button
                  className="btn-primary btn-p2p"
                  onClick={handleManualDecrypt}
                  disabled={!manualKey.trim()}
                >
                  <KeyRound size={18} />
                  Decrypt & Save File
                </button>
              </div>
            </div>
          </div>
        )}

        {status === 'decrypting' && (
          <div className="loading-section">
            <Loader size={32} className="spin" />
            <p>Decrypting file in your browser...</p>
          </div>
        )}

        {status === 'done' && (
          <div className="success-section">
            <div className="success-icon">
              <ShieldCheck size={48} />
            </div>
            <h3>File Received & Decrypted!</h3>
            <p>Your file has been securely transferred peer-to-peer.</p>
            {fileMeta?.encryptionType === 'SHA' && (
              <div className="integrity-badge">
                <CheckCircle size={16} />
                SHA-256 integrity verified ✓
              </div>
            )}
            <button className="btn-secondary" onClick={reset}>
              Receive Another File
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="error-section">
            <AlertCircle size={32} />
            <h3>Error</h3>
            <p>{error}</p>
            <button className="btn-secondary" onClick={reset}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
