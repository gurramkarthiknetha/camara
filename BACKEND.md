# Backend Implementation Guide

## Architecture

The backend is a Node.js/Express server that manages video streams and serves them via MJPEG.

### Components

1. **Frame Receiver** (`POST /api/stream/chunk`)
   - Receives video frames from frontend
   - Stores frames in memory buffer
   - Maintains frame timestamps

2. **MJPEG Server** (`GET /live/:streamId`)
   - Streams stored frames in MJPEG format
   - Sends frames as multipart/x-mixed-replace
   - Handles multiple concurrent viewers

3. **Stream Manager**
   - Tracks active streams
   - Manages frame buffers
   - Provides stream metadata

## How MJPEG Streaming Works

MJPEG (Motion JPEG) is a simple streaming protocol that sends a series of JPEG images over HTTP:

```
HTTP/1.1 200 OK
Content-Type: multipart/x-mixed-replace; boundary=--boundary

--boundary
Content-Type: image/jpeg
Content-Length: 12345

[JPEG data]

--boundary
Content-Type: image/jpeg
Content-Length: 12346

[JPEG data]

...
```

This format is:
- **Simple**: Just JPEG images in sequence
- **Compatible**: Works in all browsers via `<img>` tag
- **Low latency**: Frames sent immediately as available
- **Scalable**: Each viewer makes independent HTTP connection

## API Reference

### 1. Upload Frame
```
POST /api/stream/chunk
Content-Type: application/json

{
  "streamId": "default",
  "frameData": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "timestamp": 1704110400000
}
```

**Response**: 
```json
{
  "success": true,
  "frameCount": 30
}
```

### 2. Get MJPEG Stream
```
GET /live/default
```

**Response**: MJPEG stream (binary data)

### 3. Get Stream Info
```
GET /stream/default
```

**Response**:
```json
{
  "streamId": "default",
  "active": true,
  "frameCount": 30,
  "createdAt": "2024-01-01T12:00:00Z",
  "mjpegUrl": "/live/default"
}
```

### 4. List All Streams
```
GET /streams
```

**Response**:
```json
{
  "streams": [
    {
      "streamId": "default",
      "active": true,
      "frameCount": 30,
      "createdAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 5. Stop Stream
```
DELETE /stream/default
```

**Response**:
```json
{
  "success": true,
  "message": "Stream default stopped"
}
```

## Configuration

Edit `server.js` to customize:

```javascript
// Frame buffer size (lower = lower latency, higher = smoother)
if (stream.frames.length >= 30) {
  stream.frames.shift();
}

// Frame sending interval (ms) - 33ms = ~30 FPS
}, 33);

// Stream inactivity timeout (ms)
const timeoutId = setTimeout(() => {
  clearInterval(intervalId);
  res.end();
}, 300000); // 5 minutes
```

## Production Deployment

### Environment Variables
```bash
PORT=5000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

### Process Management with PM2
```bash
npm install -g pm2

# Start
pm2 start server.js --name "camera-stream"

# Monitor
pm2 monit

# Logs
pm2 logs camera-stream

# Restart on changes (dev mode)
pm2 start server.js --name "camera-stream" --watch
```

### Nginx Reverse Proxy
```nginx
upstream backend {
    server localhost:5000;
}

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Performance Optimization

1. **Enable Compression**
```javascript
const compression = require('compression');
app.use(compression());
```

2. **Add Health Check**
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
```

3. **Monitor Memory**
```javascript
setInterval(() => {
  console.log(`Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
}, 60000);
```

## Troubleshooting

### High Memory Usage
- Reduce `MAX_FRAMES` buffer size
- Stop inactive streams
- Monitor with `pm2 monit`

### Frame Drops
- Check network bandwidth
- Check server CPU usage
- Reduce frame rate on frontend

### CORS Issues
- Set `CORS_ORIGIN` in `.env`
- Check browser console for details

### Connection Timeout
- Verify firewall rules
- Check server logs
- Increase timeout value if needed
