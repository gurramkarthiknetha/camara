const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 6227;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Store for streaming chunks
const streamStore = new Map();

/**
 * Route: POST /api/stream/chunk
 * Receives video frames from the frontend and stores them
 */
app.post('/api/stream/chunk', (req, res) => {
  try {
    const { streamId, frameData, timestamp } = req.body;

    if (!streamId || !frameData) {
      return res.status(400).json({ error: 'streamId and frameData are required' });
    }

    // Initialize stream if not exists
    if (!streamStore.has(streamId)) {
      streamStore.set(streamId, {
        frames: [],
        createdAt: new Date(),
        active: true
      });
    }

    const stream = streamStore.get(streamId);
    
    // Keep only last 30 frames for low latency
    if (stream.frames.length >= 30) {
      stream.frames.shift();
    }

    stream.frames.push({
      data: frameData,
      timestamp: timestamp || Date.now()
    });

    stream.lastFrameTime = Date.now();

    res.json({ success: true, frameCount: stream.frames.length });
  } catch (error) {
    console.error('Error receiving frame:', error);
    res.status(500).json({ error: 'Failed to process frame' });
  }
});

/**
 * Route: GET /live/:streamId
 * MJPEG stream endpoint - serves live video as motion JPEG
 * Access in browser as: http://localhost:5000/live/default
 */
app.get('/live/:streamId', (req, res) => {
  const { streamId } = req.params;

  // Set response headers for MJPEG stream
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=--boundary');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Check if stream exists or create new one
  if (!streamStore.has(streamId)) {
    streamStore.set(streamId, {
      frames: [],
      createdAt: new Date(),
      active: true
    });
  }

  const stream = streamStore.get(streamId);
  let lastFrameIndex = -1;

  // Send frames continuously
  const intervalId = setInterval(() => {
    const frames = stream.frames;

    if (frames.length > 0) {
      const currentFrame = frames[frames.length - 1];

      // Only send if new frame available
      if (lastFrameIndex !== frames.length - 1) {
        try {
          const boundary = '\r\n--boundary\r\n';
          const frameBuffer = Buffer.from(currentFrame.data.split(',')[1], 'base64');

          res.write(boundary);
          res.write('Content-Type: image/jpeg\r\n');
          res.write(`Content-Length: ${frameBuffer.length}\r\n`);
          res.write('Content-Disposition: inline; filename="frame.jpg"\r\n\r\n');
          res.write(frameBuffer);
          res.write('\r\n');

          lastFrameIndex = frames.length - 1;
        } catch (error) {
          console.error('Error writing frame:', error);
          clearInterval(intervalId);
          res.end();
        }
      }
    }
  }, 33); // ~30 FPS

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(intervalId);
  });

  // Timeout after 5 minutes of inactivity
  const timeoutId = setTimeout(() => {
    clearInterval(intervalId);
    res.end();
  }, 300000);

  req.on('close', () => {
    clearTimeout(timeoutId);
  });
});

/**
 * Route: GET /stream/:streamId
 * WebSocket fallback endpoint - returns stream info and last frame
 */
app.get('/stream/:streamId', (req, res) => {
  const { streamId } = req.params;

  if (!streamStore.has(streamId)) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  const stream = streamStore.get(streamId);
  const lastFrame = stream.frames.length > 0 ? stream.frames[stream.frames.length - 1] : null;

  res.json({
    streamId,
    active: stream.active,
    frameCount: stream.frames.length,
    createdAt: stream.createdAt,
    lastFrame: lastFrame ? lastFrame.timestamp : null,
    mjpegUrl: `/live/${streamId}`
  });
});

/**
 * Route: GET /streams
 * List all active streams
 */
app.get('/streams', (req, res) => {
  const streams = Array.from(streamStore.entries()).map(([id, data]) => ({
    streamId: id,
    active: data.active,
    frameCount: data.frames.length,
    createdAt: data.createdAt
  }));

  res.json({ streams });
});

/**
 * Route: DELETE /stream/:streamId
 * Stop a stream
 */
app.delete('/stream/:streamId', (req, res) => {
  const { streamId } = req.params;

  if (streamStore.has(streamId)) {
    streamStore.delete(streamId);
    res.json({ success: true, message: `Stream ${streamId} stopped` });
  } else {
    res.status(404).json({ error: 'Stream not found' });
  }
});

/**
 * Route: GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

/**
 * Route: GET /
 * Root endpoint - basic info
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Live Camera Stream Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      uploadFrame: 'POST /api/stream/chunk',
      mjpegStream: 'GET /live/:streamId',
      streamInfo: 'GET /stream/:streamId',
      listStreams: 'GET /streams',
      stopStream: 'DELETE /stream/:streamId'
    },
    documentation: 'See README.md for full documentation'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🎥 Live Camera Stream Server running on http://localhost:${PORT}`);
  console.log(`📡 Stream available at http://localhost:${PORT}/live/default`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});
