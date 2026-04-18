require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { router: filesRouter } = require('./routes/files');

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

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Create a room for P2P transfer
  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      sender: socket.id,
      receiver: null,
      createdAt: new Date()
    });
    socket.join(roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
    callback({ roomId });
  });

  // Join an existing room
  socket.on('join-room', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ error: 'Room not found' });
    }
    if (room.receiver) {
      return callback({ error: 'Room is full' });
    }
    room.receiver = socket.id;
    socket.join(roomId);
    console.log(`${socket.id} joined room: ${roomId}`);
    
    // Notify sender that receiver joined
    io.to(room.sender).emit('peer-joined', { peerId: socket.id });
    callback({ success: true });
  });

  // WebRTC signaling: relay offer
  socket.on('signal-offer', ({ roomId, offer }) => {
    const room = rooms.get(roomId);
    if (room && room.receiver) {
      io.to(room.receiver).emit('signal-offer', { offer });
    }
  });

  // WebRTC signaling: relay answer
  socket.on('signal-answer', ({ roomId, answer }) => {
    const room = rooms.get(roomId);
    if (room && room.sender) {
      io.to(room.sender).emit('signal-answer', { answer });
    }
  });

  // WebRTC signaling: relay ICE candidate
  socket.on('signal-ice-candidate', ({ roomId, candidate }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const targetId = socket.id === room.sender ? room.receiver : room.sender;
    if (targetId) {
      io.to(targetId).emit('signal-ice-candidate', { candidate });
    }
  });

  // File metadata exchange for P2P
  socket.on('file-meta', ({ roomId, meta }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const targetId = socket.id === room.sender ? room.receiver : room.sender;
    if (targetId) {
      io.to(targetId).emit('file-meta', { meta });
    }
  });

  // Transfer complete notification
  socket.on('transfer-complete', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const targetId = socket.id === room.sender ? room.receiver : room.sender;
    if (targetId) {
      io.to(targetId).emit('transfer-complete');
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Clean up rooms where this socket was involved
    for (const [roomId, room] of rooms.entries()) {
      if (room.sender === socket.id || room.receiver === socket.id) {
        const otherId = room.sender === socket.id ? room.receiver : room.sender;
        if (otherId) {
          io.to(otherId).emit('peer-disconnected');
        }
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted`);
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
    if (age > 60) { // 1 hour
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
