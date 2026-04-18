import { Shield, Lock, Zap } from 'lucide-react';

export default function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">
            <Shield size={28} />
          </div>
          <div>
            <h1>CipherDrop</h1>
            <p className="tagline">End-to-End Encrypted File Sharing</p>
          </div>
        </div>
        <div className="header-badges">
          <span className="badge">
            <Lock size={14} />
            E2E Encrypted
          </span>
          <span className="badge">
            <Zap size={14} />
            Zero Knowledge
          </span>
        </div>
      </div>
    </header>
  );
}
