import { useRef, useState } from 'react';
import './TiltCard.css';

export default function TiltCard({ children, className = '' }) {
  const cardRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    
    // Disable tilt on touch devices to prevent scrolling interference
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within the element.
    const y = e.clientY - rect.top;  // y position within the element.

    setPosition({ x, y });
    
    // Tilt calculations
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -5; // max tilt 5 degrees
    const rotateY = ((x - centerX) / centerX) * 5;

    cardRef.current.style.setProperty('--rotateX', `${rotateX}deg`);
    cardRef.current.style.setProperty('--rotateY', `${rotateY}deg`);
  };

  const handleMouseEnter = () => {
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
    // Reset tilt
    if (cardRef.current) {
      cardRef.current.style.setProperty('--rotateX', '0deg');
      cardRef.current.style.setProperty('--rotateY', '0deg');
    }
  };

  return (
    <div 
      ref={cardRef}
      className={`glass-card tilt-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div 
        className="tilt-card-spotlight" 
        style={{ 
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.06), transparent 40%)`
        }} 
      />
      <div className="tilt-card-content">
        {children}
      </div>
    </div>
  );
}
