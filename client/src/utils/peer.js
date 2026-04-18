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

export const ICE_SERVERS_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all'
};

/**
 * Start offer (sender side) with targeted peer support
 */
export async function startOffer(pc, roomId, target, options = {}) {
  const offer = await pc.createOffer(options);
  await pc.setLocalDescription(offer);
  getSocket().emit('signal-offer', { roomId, offer, target });
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
        const blob = new Blob(chunks);
        resolve(blob);
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
