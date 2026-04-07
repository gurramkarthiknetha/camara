import React, { useRef, useState, useEffect } from 'react';
import './CameraCapture.css';

const DEFAULT_STATS = {
  framesSent: 0,
  lastFps: 0,
  bitrate: '0 Kbps',
};

const normalizeStreamId = (value) => {
  const safeValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeValue || 'default';
};

const createCameraId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `camera-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function CameraCapture({
  backendUrl,
  cameras,
  selectedCameraId,
  onSelectCamera,
  onCamerasChange,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [sourceSelectionByCamera, setSourceSelectionByCamera] = useState({});
  const streamIntervalRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const uploadInProgressRef = useRef(false);
  const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const normalizedBackendUrl = String(backendUrl || '').replace(/\/+$/, '');

  const currentCamera = cameras.find((camera) => camera.id === selectedCameraId) || cameras[0] || null;

  const ensureUniqueStreamId = (candidate, currentId) => {
    const base = normalizeStreamId(candidate);
    const takenIds = new Set(
      cameras
        .filter((camera) => camera.id !== currentId)
        .map((camera) => normalizeStreamId(camera.streamId))
    );

    let nextId = base;
    let suffix = 2;
    while (takenIds.has(nextId)) {
      nextId = `${base}-${suffix}`;
      suffix += 1;
    }

    return nextId;
  };

  const updateCamera = (cameraId, patch) => {
    onCamerasChange(
      cameras.map((camera) =>
        camera.id === cameraId
          ? {
              ...camera,
              ...patch,
            }
          : camera
      )
    );
  };

  const stopStreaming = () => {
    setIsStreaming(false);
    uploadInProgressRef.current = false;

    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  };

  const stopVideoTracks = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const stopCamera = () => {
    stopStreaming();
    stopVideoTracks();
    setIsCameraActive(false);
  };

  const getActiveSourceSelection = () => {
    if (!currentCamera) {
      return 'auto';
    }

    return sourceSelectionByCamera[currentCamera.id] || 'auto';
  };

  const getVideoConstraintsForSelection = (selection) => {
    const baseConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };

    if (selection.startsWith('device:')) {
      return {
        ...baseConstraints,
        deviceId: { exact: selection.replace('device:', '') },
      };
    }

    if (selection === 'facing:user') {
      return {
        ...baseConstraints,
        facingMode: { ideal: 'user' },
      };
    }

    if (selection === 'facing:environment') {
      return {
        ...baseConstraints,
        facingMode: { ideal: 'environment' },
      };
    }

    // Default source selection prefers back camera on mobile.
    if (isMobileDevice) {
      return {
        ...baseConstraints,
        facingMode: { ideal: 'environment' },
      };
    }

    return baseConstraints;
  };

  // Enumerate available cameras
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          throw new Error('MediaDevices API is not available in this browser.');
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        setDevices(videoDevices);
      } catch (err) {
        setError('Failed to enumerate devices: ' + err.message);
      }
    };

    enumerateDevices();
  }, []);

  useEffect(() => {
    const validCameraIds = new Set(cameras.map((camera) => camera.id));

    setSourceSelectionByCamera((previous) => {
      const next = {};
      Object.entries(previous).forEach(([cameraId, value]) => {
        if (validCameraIds.has(cameraId)) {
          next[cameraId] = value;
        }
      });
      return next;
    });
  }, [cameras]);

  useEffect(() => {
    if (!selectedCameraId) {
      return;
    }

    setIsStreaming(false);
    uploadInProgressRef.current = false;

    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setIsCameraActive(false);
    setStats(DEFAULT_STATS);
    setError(null);
  }, [selectedCameraId]);

  // Request camera access
  const startCamera = async () => {
    if (!currentCamera) {
      setError('No camera profile selected. Add or select a camera first.');
      return;
    }

    try {
      setError(null);
      stopCamera();

      const selection = getActiveSourceSelection();
      const constraints = {
        video: getVideoConstraintsForSelection(selection),
        audio: false,
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (primaryError) {
        if (selection.startsWith('device:')) {
          // Device IDs can become stale. Fallback to automatic selection.
          stream = await navigator.mediaDevices.getUserMedia({
            video: getVideoConstraintsForSelection('auto'),
            audio: false,
          });
        } else {
          throw primaryError;
        }
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {
        // Some browsers block explicit play calls, but stream still attaches.
      });

      setIsCameraActive(true);

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter((device) => device.kind === 'videoinput'));
    } catch (err) {
      setError('Camera access denied or not available: ' + err.message);
      console.error('Camera error:', err);
    }
  };

  // Start streaming frames to backend
  const startStreaming = async () => {
    if (!currentCamera) {
      setError('No camera profile selected. Add or select a camera first.');
      return;
    }

    if (!isCameraActive) {
      setError('Camera is not active. Please start camera first.');
      return;
    }

    try {
      setError(null);
      setIsStreaming(true);
      setStats(DEFAULT_STATS);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;
      const resolvedStreamId = ensureUniqueStreamId(currentCamera.streamId, currentCamera.id);

      if (resolvedStreamId !== currentCamera.streamId) {
        updateCamera(currentCamera.id, { streamId: resolvedStreamId });
      }

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
              streamId: resolvedStreamId,
              frameData: frameData,
              timestamp: Date.now(),
            }),
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
        const estimatedKbps =
          fps > 0 && canvas.width > 0 && canvas.height > 0
            ? ((fps * canvas.width * canvas.height * 0.8 * 8) / 1000).toFixed(0)
            : '0';

        setStats((prev) => ({
          framesSent: prev.framesSent + frameCount,
          lastFps: fps,
          bitrate: `${estimatedKbps} Kbps`,
        }));

        frameCount = 0;
        lastTime = now;
      }, 1000);
    } catch (err) {
      setError('Failed to start streaming: ' + err.message);
      setIsStreaming(false);
    }
  };

  const addCamera = () => {
    const newCamera = {
      id: createCameraId(),
      name: `Camera ${cameras.length + 1}`,
      streamId: ensureUniqueStreamId(`camera-${cameras.length + 1}`),
    };

    onCamerasChange([...cameras, newCamera]);
    onSelectCamera(newCamera.id);

    setSourceSelectionByCamera((previous) => ({
      ...previous,
      [newCamera.id]: 'auto',
    }));
  };

  const removeCamera = (cameraId) => {
    if (cameras.length <= 1) {
      setError('At least one camera profile is required.');
      return;
    }

    const remaining = cameras.filter((camera) => camera.id !== cameraId);
    if (cameraId === currentCamera?.id) {
      stopCamera();
      setStats(DEFAULT_STATS);
      setError(null);
    }

    onCamerasChange(remaining);
    if (cameraId === selectedCameraId) {
      onSelectCamera(remaining[0].id);
    }

    setSourceSelectionByCamera((previous) => {
      const next = { ...previous };
      delete next[cameraId];
      return next;
    });
  };

  const handleCameraFieldChange = (field, value) => {
    if (!currentCamera) {
      return;
    }

    updateCamera(currentCamera.id, {
      [field]: value,
    });
  };

  const handleStreamIdBlur = () => {
    if (!currentCamera) {
      return;
    }

    const nextStreamId = ensureUniqueStreamId(currentCamera.streamId, currentCamera.id);
    if (nextStreamId !== currentCamera.streamId) {
      updateCamera(currentCamera.id, { streamId: nextStreamId });
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      alert('Stream link copied to clipboard!');
    } catch {
      alert('Unable to copy link automatically.');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    const videoElement = videoRef.current;

    return () => {
      uploadInProgressRef.current = false;

      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }

      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }

      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  if (!currentCamera) {
    return (
      <div className="camera-capture">
        <h2>📹 Camera Capture & Stream</h2>
        <div className="error-message">No camera profiles found.</div>
      </div>
    );
  }

  const currentSourceSelection = getActiveSourceSelection();

  return (
    <div className="camera-capture">
      <h2>📹 Camera Capture & Stream</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="camera-manager">
        <div className="camera-manager-header">
          <h3>Camera Profiles</h3>
          <button className="btn btn-primary add-camera-btn" onClick={addCamera}>
            + Add Camera
          </button>
        </div>

        <div className="camera-profiles-list">
          {cameras.map((camera) => (
            <button
              key={camera.id}
              type="button"
              className={`camera-profile-chip ${camera.id === currentCamera.id ? 'active' : ''}`}
              onClick={() => onSelectCamera(camera.id)}
            >
              <span className="profile-name">{camera.name}</span>
              <span className="profile-stream-id">{normalizeStreamId(camera.streamId)}</span>
            </button>
          ))}
        </div>

        <div className="camera-profile-editor">
          <div className="editor-field">
            <label htmlFor="camera-name">Camera Name:</label>
            <input
              id="camera-name"
              type="text"
              value={currentCamera.name}
              onChange={(e) => handleCameraFieldChange('name', e.target.value)}
              placeholder="Camera label"
            />
          </div>

          <div className="editor-field">
            <label htmlFor="camera-stream-id">Stream ID:</label>
            <input
              id="camera-stream-id"
              type="text"
              value={currentCamera.streamId}
              onChange={(e) => handleCameraFieldChange('streamId', e.target.value)}
              onBlur={handleStreamIdBlur}
              placeholder="camera-1"
            />
          </div>

          <button
            className="btn btn-danger remove-camera-btn"
            onClick={() => removeCamera(currentCamera.id)}
            disabled={cameras.length <= 1}
          >
            Remove Camera
          </button>
        </div>
      </div>

      <div className="capture-controls">
        <div className="camera-select">
          <label htmlFor="camera-select">Camera Source:</label>
          <select
            id="camera-select"
            value={currentSourceSelection}
            onChange={(e) => {
              const selection = e.target.value;
              setSourceSelectionByCamera((previous) => ({
                ...previous,
                [currentCamera.id]: selection,
              }));
            }}
            disabled={isCameraActive}
          >
            <option value="auto">
              {isMobileDevice ? 'Auto (Back camera preferred)' : 'Auto'}
            </option>
            {isMobileDevice && <option value="facing:environment">Back Camera</option>}
            {isMobileDevice && <option value="facing:user">Front Camera</option>}
            {devices.map((device, index) => (
              <option key={device.deviceId} value={`device:${device.deviceId}`}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
          {isMobileDevice && (
            <small className="camera-source-hint">
              On mobile, auto mode requests the back camera by default.
            </small>
          )}
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
          <div className="stat-item">
            <span className="label">Stream ID:</span>
            <span className="value code">{normalizeStreamId(currentCamera.streamId)}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <h3>ℹ️ How it works</h3>
        <ol>
          <li>Add one or more camera profiles and assign each profile a stream ID</li>
          <li>Select a profile and choose source as auto, front/back (mobile), or a specific camera</li>
          <li>Click "Start Camera" and then "Start Streaming" for the selected profile</li>
          <li>Open "View Stream" to monitor all configured feeds together</li>
          <li>
            Current profile URL: <code>{backendUrl}/live/{normalizeStreamId(currentCamera.streamId)}</code>
          </li>
        </ol>
      </div>

      <div className="capture-links">
        <h3>🔗 Published Camera Links</h3>
        <div className="capture-links-list">
          {cameras.map((camera) => {
            const streamId = normalizeStreamId(camera.streamId);
            const streamUrl = `${normalizedBackendUrl}/live/${streamId}`;

            return (
              <div key={camera.id} className="capture-link-item">
                <div className="capture-link-meta">
                  <strong>{camera.name}</strong>
                  <span>
                    Streaming ID: <code>{streamId}</code>
                  </span>
                </div>

                <div className="capture-link-actions">
                  <code>{streamUrl}</code>
                  <button className="btn btn-primary capture-link-copy" onClick={() => copyLink(streamUrl)}>
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CameraCapture;
