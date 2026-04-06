import React, { useRef, useState, useEffect } from 'react';
import './StreamViewer.css';

function StreamViewer({ backendUrl, streamId }) {
  const imgRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [latency, setLatency] = useState(0);
  const connectionRef = useRef(null);
  const frameCounterRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    const displayMJPEGStream = () => {
      const stream = imgRef.current;
      if (!stream) return;

      const streamUrl = `${backendUrl}/live/${streamId || 'default'}`;
      setError(null);

      // Create an XMLHttpRequest to handle boundary parsing
      const xhr = new XMLHttpRequest();
      let lastFrame = '';
      let boundary = '';

      xhr.open('GET', streamUrl, true);
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = () => {
        try {
          if (xhr.response) {
            const data = new Uint8Array(xhr.response);
            const text = String.fromCharCode.apply(null, data);

            // Find JPEG frames (start with FFD8 and end with FFD9)
            const jpegStart = text.lastIndexOf('\xFF\xD8');
            const jpegEnd = text.lastIndexOf('\xFF\xD9');

            if (jpegStart !== -1 && jpegEnd !== -1 && jpegEnd > jpegStart) {
              const jpegData = text.substring(jpegStart, jpegEnd + 2);
              const blob = new Blob([new Uint8Array(jpegData.split('').map(c => c.charCodeAt(0)))], {
                type: 'image/jpeg'
              });

              const url = URL.createObjectURL(blob);
              stream.src = url;

              frameCounterRef.current++;
              const now = Date.now();
              if (now - lastTimeRef.current >= 1000) {
                setFrameCount(frameCounterRef.current);
                setLatency(Math.round((now - lastTimeRef.current) / frameCounterRef.current));
                frameCounterRef.current = 0;
                lastTimeRef.current = now;
              }
            }
          }
        } catch (err) {
          console.error('Error processing stream:', err);
        }
      };

      xhr.onerror = () => {
        setError('Failed to connect to stream. Ensure backend is running.');
        setIsConnected(false);
      };

      xhr.onload = () => {
        setError('Stream ended');
        setIsConnected(false);
      };

      xhr.send();
      setIsConnected(true);
      connectionRef.current = xhr;
    };

    displayMJPEGStream();

    return () => {
      if (connectionRef.current) {
        connectionRef.current.abort();
      }
    };
  }, [backendUrl, streamId]);

  return (
    <div className="stream-viewer">
      <h2>👁️ View Live Stream</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="stream-container">
        <div className="stream-wrapper">
          <img
            ref={imgRef}
            alt="Live Stream"
            className="stream-image"
            onError={() => setError('Unable to load stream')}
          />
          {isConnected && <span className="live-badge">🔴 LIVE</span>}
        </div>

        <div className="stream-stats">
          <div className="stat-item">
            <span className="label">Status:</span>
            <span className={`value ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="stat-item">
            <span className="label">Frames/sec:</span>
            <span className="value">{frameCount}</span>
          </div>
          <div className="stat-item">
            <span className="label">Latency:</span>
            <span className="value">{latency}ms</span>
          </div>
          <div className="stat-item">
            <span className="label">Stream ID:</span>
            <span className="value code">{streamId || 'default'}</span>
          </div>
        </div>
      </div>

      <div className="stream-url">
        <h3>🔗 Stream URL</h3>
        <div className="url-display">
          <code>{backendUrl}/live/{streamId || 'default'}</code>
          <button
            className="copy-btn"
            onClick={() => {
              const url = `${backendUrl}/live/${streamId || 'default'}`;
              navigator.clipboard.writeText(url);
              alert('URL copied to clipboard!');
            }}
          >
            📋 Copy
          </button>
        </div>
      </div>

      <div className="usage-section">
        <h3>💡 How to use this stream URL</h3>
        <div className="usage-example">
          <h4>In HTML:</h4>
          <pre>{`<img src="${backendUrl}/live/${streamId || 'default'}" alt="Live Stream" />`}</pre>

          <h4>In an embed:</h4>
          <pre>{`<iframe src="${backendUrl}/live/${streamId || 'default'}" 
         width="640" height="480"></iframe>`}</pre>

          <h4>In JavaScript:</h4>
          <pre>{`fetch('${backendUrl}/live/${streamId || 'default'}')
  .then(res => res.blob())
  .then(blob => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    document.body.appendChild(img);
  });`}</pre>

          <h4>With ffmpeg (save to file):</h4>
          <pre>{`ffmpeg -i "${backendUrl}/live/${streamId || 'default'}" output.mp4`}</pre>

          <h4>With curl (download stream):</h4>
          <pre>{`curl "${backendUrl}/live/${streamId || 'default'}" -o stream.mjpeg`}</pre>
        </div>
      </div>
    </div>
  );
}

export default StreamViewer;
