import { io } from 'socket.io-client';

// Use environment variable in production, fallback to localhost for development
const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for P2P transfer

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling']
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
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  const dataChannel = pc.createDataChannel('fileTransfer', {
    ordered: true
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      s.emit('signal-ice-candidate', { roomId, candidate: event.candidate });
    }
  };

  // Listen for ICE candidates from receiver
  s.on('signal-ice-candidate', ({ candidate }) => {
    if (candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  });

  // Listen for answer
  s.on('signal-answer', async ({ answer }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
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
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      s.emit('signal-ice-candidate', { roomId, candidate: event.candidate });
    }
  };

  // Listen for ICE candidates from sender
  s.on('signal-ice-candidate', ({ candidate }) => {
    if (candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  });

  // Listen for offer and send answer
  s.on('signal-offer', async ({ offer }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    s.emit('signal-answer', { roomId, answer });
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
