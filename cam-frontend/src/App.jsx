import React, { useState, useEffect } from 'react';
import './App.css';
import CameraCapture from './components/CameraCapture';
import StreamViewer from './components/StreamViewer';
import StreamInfo from './components/StreamInfo';

function App() {
  const [activeTab, setActiveTab] = useState('capture');
  const [streamId, setStreamId] = useState('default');
  const [backendUrl, setBackendUrl] = useState(
    import.meta.env.VITE_BACKEND_URL || 'http://localhost:6227'
  );
  const [backendStatus, setBackendStatus] = useState('checking');

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
      } catch (error) {
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
            placeholder="http://localhost:5000"
          />
          <label htmlFor="stream-id">Stream ID:</label>
          <input
            id="stream-id"
            type="text"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            placeholder="default"
          />
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
            <CameraCapture backendUrl={backendUrl} streamId={streamId} />
          )}
          {activeTab === 'view' && (
            <StreamViewer backendUrl={backendUrl} streamId={streamId} />
          )}
          {activeTab === 'info' && (
            <StreamInfo backendUrl={backendUrl} streamId={streamId} />
          )}
        </main>
      </div>

      <footer className="footer">
        <p>Live Camera Stream Application • Capture, Stream & Share Your Camera Feed</p>
        <p className="endpoints">
          Download stream: <code>{backendUrl}/live/{streamId}</code>
        </p>
      </footer>
    </div>
  );
}

export default App;
