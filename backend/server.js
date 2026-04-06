const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT) || 6227;
const rawCorsOrigin = process.env.CORS_ORIGIN || '';
const allowedOrigins = rawCorsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions =
  allowedOrigins.length === 0 || allowedOrigins.includes('*')
    ? { origin: true }
    : { origin: allowedOrigins };

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Store for streaming chunks
const streamStore = new Map();

const createStreamState = () => ({
  frames: [],
  createdAt: new Date(),
  active: true,
  totalFrames: 0,
  lastFrameTime: null
});

const getOrCreateStream = (streamId) => {
  if (!streamStore.has(streamId)) {
    streamStore.set(streamId, createStreamState());
  }

  return streamStore.get(streamId);
};

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

    const stream = getOrCreateStream(streamId);
    stream.totalFrames += 1;
    const frameTimestamp = timestamp || Date.now();
    
    // Keep only last 30 frames for low latency
    if (stream.frames.length >= 30) {
      stream.frames.shift();
    }

    stream.frames.push({
      data: frameData,
      timestamp: frameTimestamp,
      sequence: stream.totalFrames
    });

    stream.lastFrameTime = frameTimestamp;

    res.json({
      success: true,
      frameCount: stream.frames.length,
      totalFrames: stream.totalFrames
    });
  } catch (error) {
    console.error('Error receiving frame:', error);
    res.status(500).json({ error: 'Failed to process frame' });
  }
});

/**
 * Route: GET /live/:streamId
 * MJPEG stream endpoint - serves live video as motion JPEG
 * Access in browser as: http://localhost:6227/live/default
 */
app.get('/live/:streamId', (req, res) => {
  const { streamId } = req.params;

  // Set response headers for MJPEG stream
  // RFC 2046: boundary parameter should not include the leading "--".
  // Delimiter lines include it ("--" + boundary token) in the body.
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=boundary');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const stream = getOrCreateStream(streamId);
  let lastFrameSequence = 0;

  // Send frames continuously
  const intervalId = setInterval(() => {
    const frames = stream.frames;

    if (frames.length > 0) {
      const currentFrame = frames[frames.length - 1];

      // Only send if new frame available
      if (currentFrame.sequence !== lastFrameSequence) {
        try {
          const boundary = '\r\n--boundary\r\n';
          const framePayload =
            typeof currentFrame.data === 'string' && currentFrame.data.includes(',')
              ? currentFrame.data.split(',')[1]
              : currentFrame.data;

          if (!framePayload) {
            return;
          }

          const frameBuffer = Buffer.from(framePayload, 'base64');

          res.write(boundary);
          res.write('Content-Type: image/jpeg\r\n');
          res.write(`Content-Length: ${frameBuffer.length}\r\n`);
          res.write('Content-Disposition: inline; filename="frame.jpg"\r\n\r\n');
          res.write(frameBuffer);
          res.write('\r\n');

          lastFrameSequence = currentFrame.sequence;
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
    return res.json({
      streamId,
      active: false,
      frameCount: 0,
      totalFrames: 0,
      createdAt: null,
      lastFrame: null,
      mjpegUrl: `/live/${streamId}`
    });
  }

  const stream = streamStore.get(streamId);
  const lastFrame = stream.frames.length > 0 ? stream.frames[stream.frames.length - 1] : null;

  res.json({
    streamId,
    active: stream.active,
    frameCount: stream.frames.length,
    totalFrames: stream.totalFrames,
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
    totalFrames: data.totalFrames,
    createdAt: data.createdAt,
    lastFrameTime: data.lastFrameTime
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
