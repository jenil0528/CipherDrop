import { Server, Wifi } from 'lucide-react';

export default function ModeSelector({ mode, setMode }) {
  return (
    <div className="mode-selector">
      <h3 className="section-title">Transfer Mode</h3>
      <div className="mode-cards">
        <button
          className={`mode-card ${mode === 'server' ? 'active' : ''}`}
          onClick={() => setMode('server')}
        >
          <div className="mode-icon server-icon">
            <Server size={32} />
          </div>
          <h4>Server Relay</h4>
          <p>Upload encrypted file to server. Share link with receiver. 100MB limit.</p>
          <div className="mode-features">
            <span>✓ Async sharing</span>
            <span>✓ Link-based</span>
            <span>✓ 24h expiry</span>
          </div>
        </button>

        <button
          className={`mode-card ${mode === 'p2p' ? 'active' : ''}`}
          onClick={() => setMode('p2p')}
        >
          <div className="mode-icon p2p-icon">
            <Wifi size={32} />
          </div>
          <h4>Decentralized P2P</h4>
          <p>Direct peer-to-peer transfer via WebRTC. No file size limit.</p>
          <div className="mode-features">
            <span>✓ No size limit</span>
            <span>✓ Direct transfer</span>
            <span>✓ No server storage</span>
          </div>
        </button>
      </div>
    </div>
  );
}
