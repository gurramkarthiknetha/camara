# Frontend Implementation Guide

## Architecture

The React frontend is responsible for:
1. Accessing device camera
2. Capturing frames
3. Encoding to JPEG
4. Sending to backend
5. Displaying stream
6. Managing stream information

## Components

### App.js - Main Container
- Tab navigation
- Configuration management
- Backend connectivity check
- URL/Stream ID management

### CameraCapture.js - Camera Access
- Uses `getUserMedia()` API
- Captures frames via Canvas
- Sends frames to backend
- Displays preview
- Shows streaming statistics

### StreamViewer.js - Stream Display
- Connects to MJPEG stream
- Parses boundary-separated frames
- Displays stream
- Shows latency/FPS

### StreamInfo.js - Monitoring
- Displays stream metadata
- Shows API endpoints
- Lists active streams
- Provides usage examples

## How Camera Capture Works

### Step 1: Request Camera Access
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    deviceId: selectedDevice,
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});

videoElement.srcObject = stream;
```

### Step 2: Capture Frame to Canvas
```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
ctx.drawImage(video, 0, 0);
```

### Step 3: Convert to JPEG
```javascript
const frameData = canvas.toDataURL('image/jpeg', 0.8);
// Result: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
```

### Step 4: Send to Backend
```javascript
fetch('http://localhost:5000/api/stream/chunk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    streamId: 'default',
    frameData: frameData,
    timestamp: Date.now()
  })
});
```

## How Stream Viewing Works

### Fetch MJPEG Stream
```javascript
const response = await fetch('http://localhost:5000/live/default');
const reader = response.body.getReader();
```

### Parse MJPEG Boundary
```javascript
// MJPEG has boundary markers between frames
// Extract JPEG data between markers
const jpegStart = data.indexOf('\xFF\xD8');
const jpegEnd = data.indexOf('\xFF\xD9');
const jpegData = data.slice(jpegStart, jpegEnd + 2);
```

### Display Frame
```javascript
const blob = new Blob([jpegData], { type: 'image/jpeg' });
const url = URL.createObjectURL(blob);
imgElement.src = url;
```

## Configuration

### Environment Variables
```
REACT_APP_BACKEND_URL=http://localhost:5000
```

Production build:
```bash
REACT_APP_BACKEND_URL=https://yourdomain.com npm run build
```

### Optimization Parameters

In `CameraCapture.js`:
```javascript
// Frame rate (ms between captures)
}, 33); // ~30 FPS

// JPEG compression quality (0-1, lower = smaller file)
canvas.toDataURL('image/jpeg', 0.8); // 80% quality

// Camera resolution constraints
width: { ideal: 1280 },
height: { ideal: 720 }
```

## Camera API Support

### Browser Support
- Chrome/Chromium: ✅ Full support
- Firefox: ✅ Full support
- Safari: ⚠️ Requires HTTPS (except localhost)
- Edge: ✅ Full support
- IE 11: ❌ Not supported

### Permissions
Users must grant camera permission when first accessing:
1. Browser shows permission prompt
2. User clicks "Allow"
3. Camera stream becomes available
4. Permission is remembered for future visits

### Multiple Cameras
The frontend enumerates all available cameras:
```javascript
const devices = await navigator.mediaDevices.enumerateDevices();
const videoDevices = devices.filter(d => d.kind === 'videoinput');
```

## Styling

Components use CSS modules for scoping:
- `App.css` - Main layout
- `CameraCapture.css` - Capture interface
- `StreamViewer.css` - Stream display
- `StreamInfo.css` - Information panels

Responsive breakpoints:
- Desktop: 1024px+
- Tablet: 768px - 1024px
- Mobile: < 768px

## Development

### Start Development Server
```bash
npm start
```

### Build for Production
```bash
npm run build
```

### Debug Tips
1. Open browser DevTools (F12)
2. Check Console for errors
3. Check Network tab for API calls
4. Check camera permissions in Settings

### Local Testing
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`
- Both must be running

## Performance Optimization

### Reduce Latency
```javascript
// Increase FPS
}, 16); // ~60 FPS (from 33ms)

// Lower compression
canvas.toDataURL('image/jpeg', 0.6); // 60% quality

// Smaller resolution
width: { ideal: 640 },
height: { ideal: 480 }
```

### Reduce Bandwidth
```javascript
// Lower FPS
}, 66); // ~15 FPS (from 33ms)

// Higher compression
canvas.toDataURL('image/jpeg', 0.9); // 90% quality

// Larger resolution usually means higher bandwidth
width: { ideal: 1920 },
height: { ideal: 1080 }
```

### Browser Issues

**Chrome/Edge**
- Works best
- Full hardware acceleration
- Supports all resolution sizes

**Firefox**
- Works well
- Good performance
- May need HTTPS for production

**Safari**
- Requires HTTPS (except localhost)
- May have permission issues
- Test thoroughly on iOS

## Deployment

### Vercel
```bash
npm run build
vercel --prod
# Set REACT_APP_BACKEND_URL environment variable
```

### Netlify
```bash
npm run build
netlify deploy --prod --dir=build
```

### AWS S3
```bash
npm run build
aws s3 sync build/ s3://your-bucket/
```

### Docker
```bash
docker build -t camera-frontend .
docker run -p 3000:80 camera-frontend
```
