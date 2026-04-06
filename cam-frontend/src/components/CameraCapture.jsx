import React, { useRef, useState, useEffect } from 'react';
import './CameraCapture.css';

function CameraCapture({ backendUrl, streamId }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    framesSent: 0,
    lastFps: 0,
    bitrate: '0 Kbps'
  });
  const streamIntervalRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const uploadInProgressRef = useRef(false);

  // Enumerate available cameras
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        setError('Failed to enumerate devices: ' + err.message);
      }
    };

    enumerateDevices();
  }, []);

  // Request camera access
  const startCamera = async () => {
    try {
      setError(null);
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      setIsCameraActive(true);
    } catch (err) {
      setError('Camera access denied or not available: ' + err.message);
      console.error('Camera error:', err);
    }
  };

  // Stop camera
  const stopCamera = () => {
    stopStreaming();
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  // Start streaming frames to backend
  const startStreaming = async () => {
    if (!isCameraActive) {
      setError('Camera is not active. Please start camera first.');
      return;
    }

    try {
      setError(null);
      setIsStreaming(true);
      setStats({ framesSent: 0, lastFps: 0, bitrate: '0 Kbps' });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;

      if (!video || !canvas || !ctx) {
        throw new Error('Camera elements are not ready yet');
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve) => {
          const onReady = () => resolve();
          video.addEventListener('loadeddata', onReady, { once: true });
          setTimeout(resolve, 1500);
        });
      }

      let frameCount = 0;
      let lastTime = Date.now();

      // Send frames every 33ms (~30 FPS)
      streamIntervalRef.current = setInterval(async () => {
        if (uploadInProgressRef.current) {
          return;
        }

        try {
          if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
          }

          uploadInProgressRef.current = true;

          // Draw video frame to canvas
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          // Convert canvas to JPEG
          const frameData = canvas.toDataURL('image/jpeg', 0.8);

          // Send frame to backend
          const response = await fetch(`${backendUrl}/api/stream/chunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              streamId: streamId || 'default',
              frameData: frameData,
              timestamp: Date.now()
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to send frame (${response.status})`);
          }

          frameCount++;
        } catch (err) {
          console.error('Stream error:', err);
          setError('Streaming stopped: ' + err.message);
          stopStreaming();
        } finally {
          uploadInProgressRef.current = false;
        }
      }, 33);

      // Update statistics every second
      statsIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        const fps = Math.round(frameCount / elapsed);

        setStats(prev => ({
          framesSent: prev.framesSent + frameCount,
          lastFps: fps,
          bitrate: ((fps * canvas.width * canvas.height * 0.8 * 8) / 1000).toFixed(0) + ' Kbps'
        }));

        frameCount = 0;
        lastTime = now;
      }, 1000);
    } catch (err) {
      setError('Failed to start streaming: ' + err.message);
      setIsStreaming(false);
    }
  };

  // Stop streaming
  const stopStreaming = () => {
    setIsStreaming(false);
    uploadInProgressRef.current = false;
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
      stopCamera();
    };
  }, []);

  return (
    <div className="camera-capture">
      <h2>📹 Camera Capture & Stream</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="capture-controls">
        <div className="camera-select">
          <label htmlFor="camera-select">Select Camera:</label>
          <select
            id="camera-select"
            value={deviceId || ''}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={isCameraActive}
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${devices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={startCamera}
            disabled={isCameraActive}
          >
            Start Camera
          </button>
          <button
            className="btn btn-secondary"
            onClick={stopCamera}
            disabled={!isCameraActive}
          >
            Stop Camera
          </button>
        </div>

        <div className="button-group">
          <button
            className="btn btn-success"
            onClick={startStreaming}
            disabled={!isCameraActive || isStreaming}
          >
            Start Streaming
          </button>
          <button
            className="btn btn-danger"
            onClick={stopStreaming}
            disabled={!isStreaming}
          >
            Stop Streaming
          </button>
        </div>
      </div>

      <div className="preview-section">
        <div className="video-wrapper">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="preview-video"
          />
          {isCameraActive && <span className="live-badge">🔴 LIVE</span>}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div className="stats">
          <div className="stat-item">
            <span className="label">Streaming:</span>
            <span className={`value ${isStreaming ? 'active' : ''}`}>
              {isStreaming ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="stat-item">
            <span className="label">Frames Sent:</span>
            <span className="value">{stats.framesSent}</span>
          </div>
          <div className="stat-item">
            <span className="label">FPS:</span>
            <span className="value">{stats.lastFps}</span>
          </div>
          <div className="stat-item">
            <span className="label">Bitrate:</span>
            <span className="value">{stats.bitrate}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <h3>ℹ️ How it works</h3>
        <ol>
          <li>Select a camera device from the dropdown</li>
          <li>Click "Start Camera" to request camera access</li>
          <li>Click "Start Streaming" to begin sending frames to backend</li>
          <li>View the stream in the "View Stream" tab at: <code>{backendUrl}/live/{streamId || 'default'}</code></li>
          <li>The stream is accessible via MJPEG format - can be embedded anywhere</li>
        </ol>
      </div>
    </div>
  );
}

export default CameraCapture;
