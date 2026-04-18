import { Lock, Hash } from 'lucide-react';

export default function EncryptionSelector({ encryption, setEncryption }) {
  return (
    <div className="encryption-selector">
      <h3 className="section-title">Encryption Type</h3>
      <div className="encryption-cards">
        <button
          className={`encryption-card ${encryption === 'AES' ? 'active' : ''}`}
          onClick={() => setEncryption('AES')}
        >
          <div className="enc-icon aes-icon">
            <Lock size={24} />
          </div>
          <div>
            <h4>AES-256-GCM</h4>
            <p>Military-grade symmetric encryption. Fast & secure.</p>
          </div>
        </button>

        <button
          className={`encryption-card ${encryption === 'SHA' ? 'active' : ''}`}
          onClick={() => setEncryption('SHA')}
        >
          <div className="enc-icon sha-icon">
            <Hash size={24} />
          </div>
          <div>
            <h4>SHA-256 + AES</h4>
            <p>AES encryption with SHA-256 integrity verification hash.</p>
          </div>
        </button>
      </div>
    </div>
  );
}
