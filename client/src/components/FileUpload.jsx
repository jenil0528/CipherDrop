import { useState, useRef, useCallback } from 'react';
import { Upload, Lock, CheckCircle, Copy, AlertCircle, Loader, Clock, Shield, Link2, KeyRound } from 'lucide-react';
import { encryptFile, formatFileSize } from '../utils/crypto';
import { API_URL } from '../utils/peer';

const EXPIRY_OPTIONS = [
  { value: 15, label: '15 min', short: '15m' },
  { value: 60, label: '1 hour', short: '1h' },
  { value: 180, label: '3 hours', short: '3h' },
  { value: 360, label: '6 hours', short: '6h' },
  { value: 720, label: '12 hours', short: '12h' },
  { value: 1440, label: '24 hours', short: '24h' },
];

export default function FileUpload({ encryption }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [shareKey, setShareKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(1440);
  const [keyMode, setKeyMode] = useState('in-url'); // 'in-url' or 'separate'
  const fileInputRef = useRef(null);

  const MAX_SIZE = 100 * 1024 * 1024;

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) selectFile(droppedFile);
  }, []);

  const selectFile = (f) => {
    if (f.size > MAX_SIZE) {
      setError(`File too large! Maximum size is ${formatFileSize(MAX_SIZE)}. Use P2P mode for larger files.`);
      return;
    }
    setFile(f);
    setError('');
    setStatus('idle');
    setShareLink('');
    setShareKey('');
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      setStatus('encrypting');
      setProgress(0);
      const encResult = await encryptFile(file, encryption);
      setProgress(50);

      setStatus('uploading');
      const formData = new FormData();
      formData.append('file', encResult.encryptedBlob, 'encrypted');
      formData.append('originalName', encResult.originalName);
      formData.append('mimeType', encResult.mimeType);
      formData.append('encryptionType', encryption);
      formData.append('iv', encResult.iv);
      formData.append('expiryMinutes', String(expiryMinutes));
      if (encResult.sha256Hash) {
        formData.append('sha256Hash', encResult.sha256Hash);
      }

      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setProgress(100);

      const baseUrl = window.location.origin;

      if (keyMode === 'in-url') {
        // Key embedded in URL fragment (current behavior)
        const link = `${baseUrl}/download/${data.fileId}#key=${encodeURIComponent(encResult.keyBase64)}&iv=${encodeURIComponent(encResult.iv)}${encResult.sha256Hash ? `&hash=${encResult.sha256Hash}` : ''}`;
        setShareLink(link);
        setShareKey('');
      } else {
        // Key NOT in URL — shared separately
        const link = `${baseUrl}/download/${data.fileId}#iv=${encodeURIComponent(encResult.iv)}${encResult.sha256Hash ? `&hash=${encResult.sha256Hash}` : ''}`;
        setShareLink(link);
        setShareKey(encResult.keyBase64);
      }

      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyKey = () => {
    navigator.clipboard.writeText(shareKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setShareLink('');
    setShareKey('');
    setError('');
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
      mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      zip: '📦', rar: '📦', '7z': '📦',
      js: '💻', py: '💻', html: '💻', css: '💻',
    };
    return icons[ext] || '📎';
  };

  const selectedExpiry = EXPIRY_OPTIONS.find(o => o.value === expiryMinutes);

  return (
    <div className="file-upload-container">
      <h3 className="section-title">
        <Upload size={20} />
        Upload & Encrypt
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
            onChange={(e) => e.target.files[0] && selectFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <div className="drop-zone-content">
            <div className="drop-icon">
              <Upload size={48} />
            </div>
            <p className="drop-title">Drop your file here</p>
            <p className="drop-subtitle">or click to browse • Max 100MB for server mode</p>
            <p className="drop-types">Supports all file types: documents, images, videos, archives...</p>
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
                      <h5>Key in URL</h5>
                      <p>Decryption key embedded in the share link. Convenient one-click access.</p>
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
                      <h5>Key Separate</h5>
                      <p>Key removed from URL. Share the key through a different channel for max security.</p>
                    </div>
                    <div className="key-mode-check">
                      {keyMode === 'separate' && <CheckCircle size={18} />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Expiry Time Selector */}
              <div className="expiry-selector">
                <div className="expiry-header">
                  <Clock size={16} />
                  <span>Link Expiry Time</span>
                </div>
                <div className="expiry-options">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`expiry-chip ${expiryMinutes === opt.value ? 'active' : ''}`}
                      onClick={() => setExpiryMinutes(opt.value)}
                    >
                      <span className="expiry-chip-value">{opt.short}</span>
                      <span className="expiry-chip-label">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="expiry-note">
                  File will auto-delete after {selectedExpiry?.label}
                </p>
              </div>

              <button className="btn-primary" onClick={handleUpload}>
                <Shield size={18} />
                Encrypt & Upload
                <span className="btn-badge">{selectedExpiry?.short}</span>
              </button>
            </>
          )}

          {(status === 'encrypting' || status === 'uploading') && (
            <div className="progress-section">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="progress-text">
                <Loader size={16} className="spin" />
                {status === 'encrypting' ? 'Encrypting file...' : 'Uploading encrypted file...'}
              </p>
            </div>
          )}

          {status === 'done' && (
            <div className="share-section">
              <div className="success-badge">
                <CheckCircle size={20} />
                File encrypted & uploaded successfully!
              </div>
              <div className="share-link-box">
                <p className="share-label">Secure Share Link:</p>
                <div className="share-link-input">
                  <input type="text" value={shareLink} readOnly />
                  <button className="btn-copy" onClick={copyLink}>
                    {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {keyMode === 'in-url' ? (
                  <p className="share-note">
                    🔐 The decryption key is embedded in the URL fragment and never sent to the server.
                    Link expires in {selectedExpiry?.label}.
                  </p>
                ) : (
                  <p className="share-note share-note-warning">
                    ⚠️ Key is NOT included in this link. The receiver will need to enter the key manually.
                    Link expires in {selectedExpiry?.label}.
                  </p>
                )}
              </div>

              {/* Separate key display when key mode is 'separate' */}
              {keyMode === 'separate' && shareKey && (
                <div className="share-key-box">
                  <div className="share-key-header">
                    <KeyRound size={16} />
                    <p className="share-label">Decryption Key (share separately):</p>
                  </div>
                  <div className="share-link-input">
                    <input type="text" value={shareKey} readOnly className="key-input-field" />
                    <button className="btn-copy btn-copy-key" onClick={copyKey}>
                      {copiedKey ? <CheckCircle size={16} /> : <Copy size={16} />}
                      {copiedKey ? 'Copied!' : 'Copy Key'}
                    </button>
                  </div>
                  <p className="share-note share-note-key">
                    🔑 Share this key to the receiver through a separate secure channel (e.g., SMS, in-person, different messenger).
                    The receiver must paste this key to decrypt the file.
                  </p>
                </div>
              )}

              <button className="btn-secondary" onClick={reset}>
                Upload Another File
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="error-section">
              <AlertCircle size={20} />
              <p>{error}</p>
              <button className="btn-secondary" onClick={reset}>Try Again</button>
            </div>
          )}
        </div>
      )}

      {error && status === 'idle' && (
        <div className="error-section">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
