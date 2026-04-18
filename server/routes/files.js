const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');

const router = express.Router();

const FILE_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

// Initialize Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect().then(() => console.log('Redis connected for file metadata')).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    req.fileId = fileId;
    cb(null, fileId);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMIT }
});

// Upload encrypted file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = req.file.filename;
    // Custom expiry: accept minutes from client, cap at 24 hours (1440 min)
    let expiryMinutes = parseInt(req.body.expiryMinutes) || 1440;
    if (expiryMinutes < 1) expiryMinutes = 1;
    if (expiryMinutes > 1440) expiryMinutes = 1440;
    
    const metadata = {
      id: fileId,
      originalName: req.body.originalName || 'unknown',
      mimeType: req.body.mimeType || 'application/octet-stream',
      size: req.file.size,
      encryptionType: req.body.encryptionType || 'AES',
      sha256Hash: req.body.sha256Hash || null,
      iv: req.body.iv || null,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()
    };

    // Save to Redis with Expiration (EX is in seconds)
    await redisClient.set(`file:${fileId}`, JSON.stringify(metadata), {
      EX: expiryMinutes * 60
    });

    res.json({
      success: true,
      fileId,
      metadata: {
        originalName: metadata.originalName,
        size: metadata.size,
        encryptionType: metadata.encryptionType,
        expiresAt: metadata.expiresAt
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get file info
router.get('/file-info/:id', async (req, res) => {
  try {
    const data = await redisClient.get(`file:${req.params.id}`);
    if (!data) {
      // If it's not in Redis, it's either invalid or the TTL expired and Redis deleted it
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const metadata = JSON.parse(data);

    res.json({
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      encryptionType: metadata.encryptionType,
      sha256Hash: metadata.sha256Hash,
      iv: metadata.iv,
      expiresAt: metadata.expiresAt
    });
  } catch (err) {
    console.error('File info error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download encrypted file
router.get('/download/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const data = await redisClient.get(`file:${fileId}`);
    
    if (!data) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const metadata = JSON.parse(data);
    const filePath = path.join(__dirname, '..', 'uploads', fileId);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Sanitize the filename to prevent HTTP Header Injection / Response Splitting
    const safeFilename = encodeURIComponent(metadata.originalName || 'file') + '.enc';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cleanup physical files periodically (every 10 minutes)
// This checks the disk and deletes any files that no longer exist in Redis
setInterval(async () => {
  try {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) return;
    
    const files = fs.readdirSync(uploadDir);
    for (const fileId of files) {
      // Avoid dotfiles like .gitkeep or .DS_Store
      if (fileId.startsWith('.')) continue;

      const exists = await redisClient.exists(`file:${fileId}`);
      if (!exists) {
        fs.unlinkSync(path.join(uploadDir, fileId));
        console.log(`Redis EXPIRED -> Cleaned up physical file: ${fileId}`);
      }
    }
  } catch (err) {
    console.error('Cleanup routine error:', err);
  }
}, 10 * 60 * 1000);

// Manual deletion for session-based (Live Relay) files
async function deleteLocalFile(fileId) {
  try {
    // 1. Delete from Redis
    await redisClient.del(`file:${fileId}`);
    
    // 2. Delete from Disk
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadDir, fileId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Socket Disconnect -> Manually deleted file: ${fileId}`);
    }
    return true;
  } catch (err) {
    console.error(`Error manually deleting file ${fileId}:`, err);
    return false;
  }
}

module.exports = { 
  router,
  deleteLocalFile
};
