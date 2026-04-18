import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Download, Lock, CheckCircle, AlertCircle, Loader, ShieldCheck, Hash, KeyRound, Eye, EyeOff } from 'lucide-react';
import { decryptFile, formatFileSize, importKey } from '../utils/crypto';
import { API_URL } from '../utils/peer';
import { saveAs } from 'file-saver';

export default function FileDownload() {
  const { fileId } = useParams();
  const location = useLocation();
  const [fileInfo, setFileInfo] = useState(null);
  const [status, setStatus] = useState('loading'); // loading, ready, needsKey, decrypting, done, error
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [manualKey, setManualKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Parse key, iv, hash from URL fragment
  const getFragmentParams = (customHash = null) => {
    // Use either a provided hash string or look at the current location
    const hashStr = customHash || location.hash || window.location.hash;
    const cleanHash = hashStr.startsWith('#') ? hashStr.substring(1) : hashStr;
    const params = new URLSearchParams(cleanHash);
    
    return {
      key: params.get('key') || '',
      iv: params.get('iv') || '',
      sha256Hash: params.get('hash') || null
    };
  };

  useEffect(() => {
    fetchFileInfo();
    
    // Listen for hash changes in case user pastes fragment manually
    const handleHashChange = () => {
      const { key } = getFragmentParams();
      if (key && status === 'needsKey') {
        setStatus('ready');
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [fileId, status]);

  const fetchFileInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/file-info/${fileId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'File not found');
      }
      const data = await res.json();
      setFileInfo(data);

      // Check if key is present in the URL
      const { key } = getFragmentParams();
      if (!key) {
        setStatus('needsKey');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleDownload = async (overrideKey = null) => {
    try {
      const { key: urlKey, iv, sha256Hash } = getFragmentParams();
      const decryptionKey = overrideKey || urlKey || manualKey;
      
      if (!decryptionKey) {
        throw new Error('Missing decryption key. Please enter the key manually.');
      }
      if (!iv) {
        throw new Error('Missing IV in the URL. Make sure you have the correct link.');
      }

      // Step 1: Download encrypted file
      setStatus('decrypting');
      setProgress(20);

      const res = await fetch(`${API_URL}/download/${fileId}`);
      if (!res.ok) throw new Error('Download failed');
      
      const encryptedData = await res.arrayBuffer();
      setProgress(60);

      // Step 2: Decrypt
      const decryptedData = await decryptFile(
        encryptedData,
        decryptionKey,
        iv,
        sha256Hash || fileInfo?.sha256Hash
      );
      setProgress(90);

      // Step 3: Save file
      const blob = new Blob([decryptedData], { type: fileInfo?.mimeType || 'application/octet-stream' });
      saveAs(blob, fileInfo?.originalName || 'decrypted_file');
      
      setProgress(100);
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const handleManualKeySubmit = () => {
    if (!manualKey.trim()) return;
    handleDownload(manualKey.trim());
  };

  const formatExpiry = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    if (minutes > 0) return `${minutes}m remaining`;
    return 'Expired';
  };

  return (
    <div className="download-page">
      <div className="download-container">
        <div className="download-header">
          <div className="download-icon">
            <Lock size={40} />
          </div>
          <h2>Encrypted File Download</h2>
          <p>This file was encrypted end-to-end. Decryption happens in your browser.</p>
        </div>

        {status === 'loading' && (
          <div className="loading-section">
            <Loader size={32} className="spin" />
            <p>Fetching file information...</p>
          </div>
        )}

        {status === 'ready' && fileInfo && (
          <div className="file-ready">
            <div className="file-info-download">
              <div className="info-row">
                <span className="info-label">File Name</span>
                <span className="info-value">{fileInfo.originalName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Size</span>
                <span className="info-value">{formatFileSize(fileInfo.size)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Encryption</span>
                <span className="info-value encryption-badge">
                  {fileInfo.encryptionType === 'SHA' ? (
                    <><Hash size={14} /> SHA-256 + AES</>
                  ) : (
                    <><Lock size={14} /> AES-256-GCM</>
                  )}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Expires</span>
                <span className="info-value">{formatExpiry(fileInfo.expiresAt)}</span>
              </div>
            </div>

            <div className="key-status-badge key-auto">
              <Lock size={14} />
              <span>Decryption key detected in URL</span>
            </div>
            
            <button className="btn-primary btn-download" onClick={() => handleDownload()}>
              <Download size={20} />
              Download & Decrypt
            </button>
          </div>
        )}

        {status === 'needsKey' && fileInfo && (
          <div className="file-ready">
            <div className="file-info-download">
              <div className="info-row">
                <span className="info-label">File Name</span>
                <span className="info-value">{fileInfo.originalName}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Size</span>
                <span className="info-value">{formatFileSize(fileInfo.size)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Encryption</span>
                <span className="info-value encryption-badge">
                  {fileInfo.encryptionType === 'SHA' ? (
                    <><Hash size={14} /> SHA-256 + AES</>
                  ) : (
                    <><Lock size={14} /> AES-256-GCM</>
                  )}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Expires</span>
                <span className="info-value">{formatExpiry(fileInfo.expiresAt)}</span>
              </div>
            </div>

            <div className="manual-key-section">
              <div className="manual-key-header">
                <div className="manual-key-icon">
                  <KeyRound size={24} />
                </div>
                <div>
                  <h4>Decryption Key Required</h4>
                  <p>The sender chose to share the key separately, OR the link was truncated by your messaging app. Paste the key or the <b>full link</b> below.</p>
                </div>
              </div>
              <div className="manual-key-input-group">
                <div className="manual-key-input-wrap">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="manual-key-input"
                    placeholder="Paste key or full link here..."
                    value={manualKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Detect if a full link was pasted
                      if (val.includes('#key=')) {
                        const hashPart = val.substring(val.indexOf('#'));
                        const params = getFragmentParams(hashPart);
                        if (params.key) {
                          setManualKey(params.key);
                          // Auto-fill IV and other params implicitly via getFragmentParams in handleDownload
                          return;
                        }
                      }
                      setManualKey(val);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualKeySubmit()}
                  />
                  <button
                    className="btn-toggle-key"
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  className="btn-primary btn-download"
                  onClick={handleManualKeySubmit}
                  disabled={!manualKey.trim()}
                >
                  <Download size={20} />
                  Decrypt & Download
                </button>
              </div>
            </div>
          </div>
        )}

        {status === 'decrypting' && (
          <div className="progress-section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-text">
              <Loader size={16} className="spin" />
              {progress < 50 ? 'Downloading encrypted file...' :
               progress < 85 ? 'Decrypting in browser...' : 'Saving file...'}
            </p>
          </div>
        )}

        {status === 'done' && (
          <div className="success-section">
            <div className="success-icon">
              <ShieldCheck size={48} />
            </div>
            <h3>File Decrypted Successfully!</h3>
            <p>Your file has been decrypted and downloaded securely.</p>
            {fileInfo?.encryptionType === 'SHA' && (
              <div className="integrity-badge">
                <CheckCircle size={16} />
                SHA-256 integrity verified ✓
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="error-section">
            <AlertCircle size={32} />
            <h3>Error</h3>
            <p>{error}</p>
            <button className="btn-secondary" onClick={() => {
              setError('');
              const { key } = getFragmentParams();
              setStatus(key ? 'ready' : 'needsKey');
            }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
