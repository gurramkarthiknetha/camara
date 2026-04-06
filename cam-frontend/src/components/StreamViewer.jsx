import React, { useRef, useState, useEffect } from 'react';
import './StreamViewer.css';

function StreamViewer({ backendUrl, streamId }) {
  const imgRef = useRef(null);
  const metadataIntervalRef = useRef(null);
  const previousFrameCountRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [latency, setLatency] = useState(0);
  const [streamUrl, setStreamUrl] = useState('');

  useEffect(() => {
    const resolvedStreamId = streamId || 'default';
    const resolvedStreamUrl = `${backendUrl}/live/${resolvedStreamId}?t=${Date.now()}`;

    setError(null);
    setIsConnected(false);
    setFrameCount(0);
    setLatency(0);
    previousFrameCountRef.current = 0;
    setStreamUrl(resolvedStreamUrl);

    const fetchStreamMetadata = async () => {
      try {
        const response = await fetch(`${backendUrl}/stream/${resolvedStreamId}`);

        if (!response.ok) {
          // No active producer yet, keep waiting quietly while viewer stays mounted.
          setFrameCount(0);
          setLatency(0);
          return;
        }

        const data = await response.json();
        const framesNow = data.totalFrames ?? data.frameCount ?? 0;
        const fps = Math.max(framesNow - previousFrameCountRef.current, 0);

        previousFrameCountRef.current = framesNow;
        setFrameCount(fps);

        if (data.lastFrame) {
          setLatency(Math.max(Date.now() - data.lastFrame, 0));
        } else {
          setLatency(0);
        }
      } catch (err) {
        setError('Failed to fetch stream metadata. Ensure backend is running.');
        setIsConnected(false);
      }
    };

    fetchStreamMetadata();
    metadataIntervalRef.current = setInterval(fetchStreamMetadata, 1000);

    return () => {
      if (metadataIntervalRef.current) {
        clearInterval(metadataIntervalRef.current);
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
            src={streamUrl}
            onLoad={() => {
              setIsConnected(true);
              setError(null);
            }}
            onError={() => {
              setIsConnected(false);
              setError('Unable to load stream. Start capture and streaming first.');
            }}
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
