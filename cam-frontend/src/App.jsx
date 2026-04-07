import React, { useState, useEffect } from 'react';
import './App.css';
import CameraCapture from './components/CameraCapture';
import StreamViewer from './components/StreamViewer';
import StreamInfo from './components/StreamInfo';

const createCameraId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `camera-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function App() {
  const [activeTab, setActiveTab] = useState('capture');
  const defaultStreamId = import.meta.env.VITE_DEFAULT_STREAM_ID || 'default';
  const [cameraState, setCameraState] = useState(() => {
    const initialCamera = {
      id: createCameraId(),
      name: 'Camera 1',
      streamId: defaultStreamId,
    };

    return {
      cameras: [initialCamera],
      selectedCameraId: initialCamera.id,
    };
  });

  const cameras = cameraState.cameras;
  const selectedCameraId = cameraState.selectedCameraId;
  const [backendUrl, setBackendUrl] = useState(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:6227'
  );
  const [backendStatus, setBackendStatus] = useState('checking');

  const handleCamerasChange = (nextCameras) => {
    setCameraState((previous) => {
      const resolvedCameras = nextCameras.length > 0 ? nextCameras : previous.cameras;
      const hasSelectedCamera = resolvedCameras.some(
        (camera) => camera.id === previous.selectedCameraId
      );

      return {
        cameras: resolvedCameras,
        selectedCameraId: hasSelectedCamera
          ? previous.selectedCameraId
          : resolvedCameras[0].id,
      };
    });
  };

  const handleSelectCamera = (nextCameraId) => {
    setCameraState((previous) => ({
      ...previous,
      selectedCameraId: nextCameraId,
    }));
  };

  useEffect(() => {
    // Check backend availability
    const checkBackend = async () => {
      try {
        const response = await fetch(`${backendUrl}/health`, {
          method: 'GET',
        });
        if (response.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }
      } catch {
        setBackendStatus('offline');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 5000);

    return () => clearInterval(interval);
  }, [backendUrl]);

  const handleBackendUrlChange = (e) => {
    setBackendUrl(e.target.value);
  };

  const selectedCamera =
    cameras.find((camera) => camera.id === selectedCameraId) || cameras[0] || null;
  const selectedStreamId = selectedCamera?.streamId || defaultStreamId;

  return (
    <div className="app">
      <header className="header">
        <h1>🎥 Live Camera Stream</h1>
        <div className="backend-status">
          <span className={`status-indicator ${backendStatus}`}></span>
          <span className="status-text">{backendStatus}</span>
        </div>
      </header>

      <div className="container">
        <div className="config-section">
          <label htmlFor="backend-url">Backend URL:</label>
          <input
            id="backend-url"
            type="text"
            value={backendUrl}
            onChange={handleBackendUrlChange}
            placeholder="http://localhost:6227"
          />
          <div className="selected-stream-id">
            <span>Selected stream:</span>
            <code>{selectedStreamId}</code>
          </div>
        </div>

        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'capture' ? 'active' : ''}`}
            onClick={() => setActiveTab('capture')}
          >
            📹 Capture
          </button>
          <button
            className={`tab ${activeTab === 'view' ? 'active' : ''}`}
            onClick={() => setActiveTab('view')}
          >
            👁️ View Stream
          </button>
          <button
            className={`tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            ℹ️ Stream Info
          </button>
        </nav>

        <main className="content">
          {activeTab === 'capture' && (
            <CameraCapture
              backendUrl={backendUrl}
              cameras={cameras}
              selectedCameraId={selectedCameraId}
              onSelectCamera={handleSelectCamera}
              onCamerasChange={handleCamerasChange}
            />
          )}
          {activeTab === 'view' && (
            <StreamViewer backendUrl={backendUrl} cameras={cameras} />
          )}
          {activeTab === 'info' && (
            <StreamInfo
              backendUrl={backendUrl}
              streamId={selectedStreamId}
              cameras={cameras}
            />
          )}
        </main>
      </div>

      <footer className="footer">
        <p>Live Camera Stream Application • Capture, Stream & Share Your Camera Feed</p>
        <p className="endpoints">
          Download stream: <code>{backendUrl}/live/{selectedStreamId}</code>
        </p>
      </footer>
    </div>
  );
}

export default App;
