import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Header from './components/Header';
import ModeSelector from './components/ModeSelector';
import EncryptionSelector from './components/EncryptionSelector';
import FileUpload from './components/FileUpload';
import FileDownload from './components/FileDownload';
import PeerSend from './components/PeerSend';
import PeerReceive from './components/PeerReceive';
import { Shield, ArrowLeft, Send, Download, Lock, Fingerprint, Zap } from 'lucide-react';
import './App.css';

/* ─── Ultra-Premium Decrypt Text Sequence ─── */
function DecryptText({ text, speed = 40, delay = 0 }) {
  const [displayText, setDisplayText] = useState('');
  const chars = '█▓▒░<>/?!#-_\\|/=+abcdef0123456789';
  
  useEffect(() => {
    let iteration = 0;
    let interval = null;
    let startTimer = null;

    startTimer = setTimeout(() => {
      interval = setInterval(() => {
        setDisplayText(
          text.split('')
            .map((letter, index) => {
              if (index < iteration) {
                return text[index];
              }
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('')
        );

        if (iteration >= text.length) {
          clearInterval(interval);
        }
        iteration += 1 / 4; // Reveal speed mapping
      }, speed);
    }, delay);

    return () => {
      clearInterval(interval);
      clearTimeout(startTimer);
    };
  }, [text, speed, delay]);

  return <span className="pro-start-text">{displayText || ' '}</span>;
}

/* ─── Sleek Professional Starting Effect ─── */
function WebsiteStartEffect({ onComplete }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1600), // Decryption finished, flash success
      setTimeout(() => setPhase(2), 2400), // Camera zoom into the logo (shatter)
      setTimeout(() => onComplete(), 3000), // End sequence entirely
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className={`pro-start-overlay ${phase >= 2 ? 'pro-start-exit' : ''}`}>
      <div className="pro-start-content">
        <div className={`pro-start-logo ${phase >= 1 ? 'pro-start-success' : ''}`}>
          <Shield size={44} className="pro-start-icon" strokeWidth={1.5} />
          <DecryptText text="CIPHERDROP" speed={30} delay={400} />
        </div>
      </div>
    </div>
  );
}

/* ─── Professional Background ─── */
function ProfessionalBackground() {
  return (
    <div className="pro-bg" aria-hidden="true">
      <div className="pro-bg-grid"></div>
      <div className="pro-bg-glow top-left"></div>
      <div className="pro-bg-glow center-right"></div>
      <div className="pro-bg-noise"></div>
    </div>
  );
}

/* ─── Scroll-triggered reveal ─── */
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ─── Animated text that reveals character by character ─── */
function AnimatedText({ text, className, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <span className={`${className} ${visible ? 'text-visible' : 'text-hidden'}`}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="char-reveal"
          style={{ animationDelay: `${delay + i * 30}ms` }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

/* ─── Typewriter subtitle ─── */
function TypeWriter({ text, speed = 25, delay = 800 }) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length < text.length) {
      const timer = setTimeout(() => {
        setDisplayed(text.slice(0, displayed.length + 1));
      }, speed);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setShowCursor(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [displayed, started, text, speed]);

  return (
    <p className="hero-subtitle typewriter-text">
      {displayed}
      {showCursor && <span className="typewriter-cursor">|</span>}
    </p>
  );
}

/* ─── Animated counter stat ─── */
function AnimatedStat({ value, label, suffix = '', icon }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1500;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, value]);

  return (
    <div className="stat-item" ref={ref}>
      {icon && <span className="stat-icon">{icon}</span>}
      <span className="stat-value">{count}{suffix}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/* ─── Premium UI Effects (Spotlight & 3D Tilt) ─── */
function usePremiumEffects(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    const handleMove = (e) => {
      // Global spotlight coords
      el.style.setProperty('--spot-x', `${e.clientX}px`);
      el.style.setProperty('--spot-y', `${e.clientY}px`);
      
      // Card specific physics
      const cards = el.querySelectorAll('.glass-card, .mode-card, .encryption-card, .info-card, .key-mode-card, .receive-card, .info-card-p2p');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        
        // Spotlight tracking percentage
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);

        // 3D Tilt Physics (only tilt if mouse is nearby or inside)
        const isHovered = (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        );

        if (isHovered) {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Max tilt ~ 4 degrees for subtle realism
          const rotateX = ((e.clientY - centerY) / (rect.height / 2)) * -4;
          const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 4;
          
          card.style.setProperty('--rotateX', `${rotateX}deg`);
          card.style.setProperty('--rotateY', `${rotateY}deg`);
          card.classList.add('is-tilted');
        } else {
          card.style.setProperty('--rotateX', `0deg`);
          card.style.setProperty('--rotateY', `0deg`);
          card.classList.remove('is-tilted');
        }
      });
    };
    
    // Smooth magnetic reset on leave
    const handleLeave = () => {
      const cards = el.querySelectorAll('.glass-card, .mode-card, .encryption-card, .info-card, .key-mode-card, .receive-card, .info-card-p2p');
      cards.forEach((card) => {
        card.style.setProperty('--rotateX', `0deg`);
        card.style.setProperty('--rotateY', `0deg`);
        card.classList.remove('is-tilted');
      });
    };

    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [ref]);
}

/* ─── Home Page ─── */
function HomePage() {
  const [activeTab, setActiveTab] = useState('send');
  const [mode, setMode] = useState('server');
  const [encryption, setEncryption] = useState('AES');
  const [receiveRoomId, setReceiveRoomId] = useState('');
  const mainRef = useRef(null);
  usePremiumEffects(mainRef);
  useScrollReveal();

  return (
    <div className="home-page" ref={mainRef}>
      <ProfessionalBackground />
      <Header />
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-badge reveal-on-scroll">
            <Lock size={14} />
            <span>Trusted by security professionals</span>
          </div>
          <h2 className="hero-title">
            <AnimatedText text="Share files with " className="hero-text-white" delay={200} />
            <AnimatedText text="military-grade" className="gradient-text" delay={700} />
            <br />
            <AnimatedText text="encryption" className="hero-text-white" delay={1200} />
          </h2>
          <TypeWriter
            text="Your files are encrypted in the browser before they ever leave your device. The server never sees your data. True zero-knowledge encryption."
            speed={18}
            delay={1800}
          />
          <div className="stats-bar reveal-on-scroll">
            <AnimatedStat value={256} label="Bit Encryption" icon={<Lock size={16} />} />
            <div className="stat-divider"></div>
            <AnimatedStat value={0} label="Server Access" icon={<Fingerprint size={16} />} />
            <div className="stat-divider"></div>
            <AnimatedStat value={100} label="Max File Size" suffix="MB" icon={<Zap size={16} />} />
          </div>
        </div>

        {/* Send / Receive Tab Switcher */}
        <div className="role-switcher reveal-on-scroll">
          <button
            className={`role-tab ${activeTab === 'send' ? 'active' : ''}`}
            onClick={() => setActiveTab('send')}
          >
            <Send size={18} />
            <span>Sender</span>
            <span className="role-tab-desc">Encrypt & share files</span>
          </button>
          <button
            className={`role-tab role-tab-receive ${activeTab === 'receive' ? 'active' : ''}`}
            onClick={() => setActiveTab('receive')}
          >
            <Download size={18} />
            <span>Receiver</span>
            <span className="role-tab-desc">Receive & decrypt files</span>
          </button>
        </div>

        {activeTab === 'send' && (
          <div className="tab-content tab-enter">
            <div className="config-section">
              <ModeSelector mode={mode} setMode={setMode} />
              <EncryptionSelector encryption={encryption} setEncryption={setEncryption} />
            </div>

            <div className="upload-section">
              {mode === 'server' ? (
                <FileUpload encryption={encryption} />
              ) : (
                <PeerSend encryption={encryption} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'receive' && (
          <div className="receive-section tab-content tab-enter">
            <div className="receive-mode-cards">
              <div className="receive-card">
                <div className="receive-card-header">
                  <div className="receive-card-icon server-icon">
                    <Download size={28} />
                  </div>
                  <div>
                    <h4>Server Relay Download</h4>
                    <p>Open the share link sent by the sender to download and decrypt the file.</p>
                  </div>
                </div>
                <div className="receive-card-body">
                  <div className="receive-link-input-group">
                    <input
                      type="text"
                      className="receive-link-input"
                      placeholder="Paste the share link here..."
                      id="server-receive-link"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.target.value.trim();
                          if (val) {
                            try {
                              const parsedUrl = new URL(val);
                              if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                                window.location.href = val;
                              } else {
                                alert("Security Error: Only http:// and https:// URLs are allowed.");
                              }
                            } catch {
                              if (val.startsWith('/download/')) {
                                window.location.href = window.location.origin + val;
                              } else {
                                alert("Invalid link format. Please provide a full URL or /download/... path.");
                              }
                            }
                          }
                        }
                      }}
                    />
                    <button
                      className="btn-primary btn-receive-go"
                      onClick={() => {
                        const input = document.getElementById('server-receive-link');
                        const val = input?.value?.trim();
                        if (val) {
                          try {
                            const parsedUrl = new URL(val);
                            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                              window.location.href = val;
                            } else {
                              alert("Security Error: Only http:// and https:// URLs are allowed.");
                            }
                          } catch {
                            if (val.startsWith('/download/')) {
                              window.location.href = window.location.origin + val;
                            } else {
                              alert("Invalid link format. Please provide a full URL or /download/... path.");
                            }
                          }
                        }
                      }}
                    >
                      Open Link
                    </button>
                  </div>
                  <p className="receive-note">
                    📋 Paste the full share link you received. The decryption key is safely embedded in the URL or may need to be entered separately.
                  </p>
                </div>
              </div>

              <div className="receive-card">
                <div className="receive-card-header">
                  <div className="receive-card-icon p2p-icon">
                    <Download size={28} />
                  </div>
                  <div>
                    <h4>P2P Direct Receive</h4>
                    <p>Join a room to receive files directly from the sender via WebRTC.</p>
                  </div>
                </div>
                <div className="receive-card-body">
                  <div className="receive-link-input-group">
                    <input
                      type="text"
                      className="receive-room-input"
                      placeholder="Enter room code (e.g. ABC123)"
                      value={receiveRoomId}
                      onChange={(e) => setReceiveRoomId(e.target.value.toUpperCase())}
                      maxLength={6}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && receiveRoomId.length === 6) {
                          window.location.href = `${window.location.origin}/receive/${receiveRoomId}`;
                        }
                      }}
                    />
                    <Link
                      to={receiveRoomId.length === 6 ? `/receive/${receiveRoomId}` : '#'}
                      className={`btn-primary btn-p2p btn-receive-go ${receiveRoomId.length !== 6 ? 'disabled' : ''}`}
                      onClick={(e) => {
                        if (receiveRoomId.length !== 6) e.preventDefault();
                      }}
                    >
                      Join Room
                    </Link>
                  </div>
                  <p className="receive-note">
                    🔗 Enter the 6-digit room code shared by the sender, or paste the full receive link.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="info-section reveal-on-scroll">
          <div className="info-card">
            <div className="info-icon">🔒</div>
            <h4>Browser-Side Encryption</h4>
            <p>All encryption happens locally in your browser using Web Crypto API. Zero server access.</p>
          </div>
          <div className="info-card">
            <div className="info-icon">🔑</div>
            <h4>Flexible Key Sharing</h4>
            <p>Choose to embed the key in the URL or share it separately for maximum security.</p>
          </div>
          <div className="info-card">
            <div className="info-icon">⏱️</div>
            <h4>Custom Expiry</h4>
            <p>Set custom expiry from 15 minutes to 24 hours. Files auto-delete when expired.</p>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>
          <Shield size={14} />
          CipherDrop — End-to-End Encrypted File Sharing
        </p>
      </footer>
    </div>
  );
}

function DownloadPage() {
  return (
    <div className="page-wrapper">
      <ProfessionalBackground />
      <div className="page-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          Back to Home
        </Link>
      </div>
      <FileDownload />
    </div>
  );
}

function ReceivePage() {
  return (
    <div className="page-wrapper">
      <ProfessionalBackground />
      <div className="page-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          Back to Home
        </Link>
      </div>
      <PeerReceive />
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  return (
    <Router>
      {!splashDone && <WebsiteStartEffect onComplete={handleSplashComplete} />}
      <div className={`app-root ${splashDone ? 'app-visible' : 'app-hidden'}`}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/download/:fileId" element={<DownloadPage />} />
          <Route path="/receive/:roomId" element={<ReceivePage />} />
          <Route path="/receive" element={<ReceivePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
