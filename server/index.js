require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { router: filesRouter, deleteLocalFile } = require('./routes/files');

const app = express();
const server = http.createServer(app);

// Configure strong CORS
const clientUrl = process.env.CLIENT_URL || '';
const isWildcard = clientUrl === '*';
const allowedOrigins = isWildcard 
  ? [] 
  : clientUrl 
    ? clientUrl.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins if wildcard is set
    if (isWildcard) {
      callback(null, true);
      return;
    }
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST']
};

// Socket.io for WebRTC signaling
const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 1e8 // 100MB for socket
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiter to all api routes
app.use('/api', limiter);

// API Routes
app.use('/api', filesRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================
// WebRTC Signaling Logic
// =====================
const rooms = new Map();
const socketToFiles = new Map(); // socket.id -> [fileId1, fileId2, ...]

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create a room for P2P transfer
  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      sender: socket.id,
      receivers: new Set(),
      createdAt: new Date(),
      unlimited: false // Default to standard cleanup
    });
    socket.join(roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
    callback({ roomId });
  });

  // Set room to unlimited session (stays alive until sender leaves)
  socket.on('set-unlimited-room', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.sender === socket.id) {
      room.unlimited = true;
      console.log(`Room ${roomId} set to UNLIMITED session`);
    }
  });

  // Tracking for "Live Relay" files (delete on disconnect)
  socket.on('track-live-file', (fileId) => {
    if (!socketToFiles.has(socket.id)) {
      socketToFiles.set(socket.id, []);
    }
    socketToFiles.get(socket.id).push(fileId);
    console.log(`Tracking live file ${fileId} for socket ${socket.id}`);
  });

  // Join an existing room
  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: 'Room not found' });
    }
    room.receivers.add(socket.id);
    socket.join(roomId);
    console.log(`${socket.id} joined room: ${roomId}`);
    
    // Notify sender that receiver joined
    io.to(room.sender).emit('peer-joined', { peerId: socket.id });
    callback({ success: true });
  });

  // WebRTC signaling: relay offer (from sender to specific receiver)
  socket.on('signal-offer', ({ roomId, offer, target }) => {
    if (target) {
      io.to(target).emit('signal-offer', { offer });
    }
  });

  // New handshake event: Receiver is ready for connection
  socket.on('signal-ready', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.sender) {
      io.to(room.sender).emit('signal-ready', { from: socket.id });
    }
  });

  // WebRTC signaling: relay answer (from receiver to sender)
  socket.on('signal-answer', ({ roomId, answer }) => {
    const room = rooms.get(roomId);
    if (room && room.sender) {
      // Inject 'from' so sender knows which connection this is for
      io.to(room.sender).emit('signal-answer', { from: socket.id, answer });
    }
  });

  // WebRTC signaling: relay ICE candidate
  socket.on('signal-ice-candidate', ({ roomId, candidate, target }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (socket.id === room.sender) {
      if (target) io.to(target).emit('signal-ice-candidate', { candidate });
    } else {
      io.to(room.sender).emit('signal-ice-candidate', { from: socket.id, candidate });
    }
  });

  // File metadata exchange for P2P (from sender to receiver)
  socket.on('file-meta', ({ roomId, meta, target }) => {
    if (target) io.to(target).emit('file-meta', { meta });
  });

  // Transfer complete notification (from sender to receiver)
  socket.on('transfer-complete', ({ roomId, target }) => {
    if (target) io.to(target).emit('transfer-complete');
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // 1. Cleanup "Live Relay" files
    if (socketToFiles.has(socket.id)) {
      const fileIds = socketToFiles.get(socket.id);
      for (const fileId of fileIds) {
        await deleteLocalFile(fileId);
      }
      socketToFiles.delete(socket.id);
    }

    // 2. Clean up rooms where this socket was involved
    for (const [roomId, room] of rooms.entries()) {
      if (room.sender === socket.id) {
        // Sender left, notify all receivers and delete room
        for (const receiverId of room.receivers) {
          io.to(receiverId).emit('peer-disconnected');
        }
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (Sender left)`);
      } else if (room.receivers.has(socket.id)) {
        // A receiver left
        room.receivers.delete(socket.id);
        io.to(room.sender).emit('peer-disconnected', { peerId: socket.id });
        console.log(`Socket ${socket.id} (Receiver) left room ${roomId}`);
        
        // Delete if not unlimited session
        if (!room.unlimited) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (Receiver left, Standard session)`);
        }
      }
    }
  });
});

function generateRoomId() {
  // Use cryptographically secure random bytes for room IDs
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Cleanup old rooms (every 30 minutes)
setInterval(() => {
  const now = new Date();
  for (const [roomId, room] of rooms.entries()) {
    const age = (now - room.createdAt) / 1000 / 60;
    if (age > 60 && !room.unlimited) { // 1 hour, skip if unlimited
      rooms.delete(roomId);
      console.log(`Cleaned up old room: ${roomId}`);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🔐 Encrypted File Share Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api\n`);
});
