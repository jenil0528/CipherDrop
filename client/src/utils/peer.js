import { io } from 'socket.io-client';

// Use environment variable in production, fallback to localhost for development
const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for P2P transfer

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000
    });
    
    socket.on('connect_error', (err) => {
      console.error('Socket.io connection error:', err);
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Create a new room for P2P file transfer
 */
export function createRoom() {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('create-room', (response) => {
      if (response.error) reject(new Error(response.error));
      else resolve(response.roomId);
    });
  });
}

/**
 * Join an existing room
 */
export function joinRoom(roomId) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.emit('join-room', roomId, (response) => {
      if (response.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

/**
 * Create WebRTC peer connection for sending
 */
export function createSenderPeer(roomId) {
  const s = getSocket();
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.freeswitch.org:3478' },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
  });

  const pendingCandidates = [];


  const dataChannel = pc.createDataChannel('fileTransfer', {
    ordered: true
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      s.emit('signal-ice-candidate', { roomId, candidate: event.candidate });
    }
  };

  // Clean up any old listeners before adding new ones
  s.off('signal-ice-candidate');
  s.off('signal-answer');

  // Listen for ICE candidates from receiver
  s.on('signal-ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    try {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  });

  // Listen for answer
  s.on('signal-answer', async ({ answer }) => {
    try {
      console.log('Sender: Received answer, setting remote description...');
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process buffered candidates
      console.log(`Processing ${pendingCandidates.length} buffered candidates...`);
      while (pendingCandidates.length > 0) {
        const cand = pendingCandidates.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.error('Delayed candidate error:', e));
      }
    } catch (err) {
      console.error('Error setting remote description:', err);
    }
  });

  return { pc, dataChannel };
}

/**
 * Create WebRTC peer connection for receiving
 */
export function createReceiverPeer(roomId) {
  const s = getSocket();
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.freeswitch.org:3478' },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10
  });

  const pendingCandidates = [];


  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      s.emit('signal-ice-candidate', { roomId, candidate: event.candidate });
    }
  };

  // Clean up any old listeners before adding new ones
  s.off('signal-ice-candidate');
  s.off('signal-offer');

  // Listen for ICE candidates from sender
  s.on('signal-ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    try {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  });

  // Listen for offer and send answer
  s.on('signal-offer', async ({ offer }) => {
    try {
      console.log('Receiver: Received offer, setting remote description...');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit('signal-answer', { roomId, answer });

      // Process buffered candidates
      console.log(`Processing ${pendingCandidates.length} buffered candidates...`);
      while (pendingCandidates.length > 0) {
        const cand = pendingCandidates.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.error('Delayed candidate error:', e));
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  });

  return { pc };
}

/**
 * Start offer (sender side)
 */
export async function startOffer(pc, roomId) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  getSocket().emit('signal-offer', { roomId, offer });
}

/**
 * Send file data over data channel in chunks
 */
export function sendFileData(dataChannel, encryptedData, onProgress) {
  return new Promise((resolve, reject) => {
    const data = new Uint8Array(encryptedData);
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
    let chunkIndex = 0;

    function sendChunk() {
      while (chunkIndex < totalChunks) {
        if (dataChannel.bufferedAmount > CHUNK_SIZE * 8) {
          // Wait for buffer to drain
          setTimeout(sendChunk, 50);
          return;
        }

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const chunk = data.slice(start, end);
        
        dataChannel.send(chunk);
        chunkIndex++;

        if (onProgress) {
          onProgress(chunkIndex / totalChunks);
        }
      }

      // Send end marker
      dataChannel.send('__EOF__');
      resolve();
    }

    dataChannel.onbufferedamountlow = sendChunk;
    sendChunk();
  });
}

/**
 * Receive file data over data channel
 */
export function receiveFileData(dataChannel, expectedSize, onProgress) {
  return new Promise((resolve) => {
    const chunks = [];
    let receivedSize = 0;

    dataChannel.onmessage = (event) => {
      if (typeof event.data === 'string' && event.data === '__EOF__') {
        const fullData = new Uint8Array(receivedSize);
        let offset = 0;
        for (const chunk of chunks) {
          fullData.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        resolve(fullData.buffer);
        return;
      }

      const chunk = event.data;
      chunks.push(chunk);
      receivedSize += chunk.byteLength;

      if (onProgress && expectedSize) {
        onProgress(Math.min(receivedSize / expectedSize, 1));
      }
    };
  });
}

export const API_URL = SERVER_URL + '/api';
