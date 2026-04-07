import React, { useRef, useState, useEffect, useMemo } from 'react';
import './StreamViewer.css';

const normalizeStreamId = (value) => {
  const safeValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeValue || 'default';
};

const buildStreamTargets = (cameras = []) => {
  const targets = cameras.map((camera, index) => ({
    cameraId: camera.id || `camera-${index + 1}`,
    streamId: normalizeStreamId(camera.streamId),
    name: camera.name || `Camera ${index + 1}`,
  }));

  if (targets.length === 0) {
    return [{ cameraId: 'default-camera', streamId: 'default', name: 'Default Camera' }];
  }

  return targets;
};

function StreamViewer({ backendUrl, cameras }) {
  const metadataIntervalRef = useRef(null);
  const previousFrameCountRef = useRef({});
  const [streamStats, setStreamStats] = useState({});
  const [imageErrors, setImageErrors] = useState({});
  const [error, setError] = useState(null);

  const streamTargets = useMemo(() => buildStreamTargets(cameras), [cameras]);
  const normalizedBackendUrl = useMemo(
    () => String(backendUrl || '').replace(/\/+$/, ''),
    [backendUrl]
  );

  useEffect(() => {
    previousFrameCountRef.current = {};
    setError(null);

    setStreamStats((prev) => {
      const next = {};
      streamTargets.forEach((target) => {
        next[target.cameraId] = {
          ...(prev[target.cameraId] || {}),
          status: 'waiting',
          fps: 0,
          latency: 0,
          totalFrames: 0,
          error: null,
        };
      });
      return next;
    });

    const fetchStreamMetadata = async () => {
      const updates = await Promise.all(
        streamTargets.map(async (target) => {
          try {
            const response = await fetch(`${backendUrl}/stream/${target.streamId}`);
            if (!response.ok) {
              throw new Error(`Failed to fetch stream ${target.streamId}`);
            }

            const data = await response.json();
            const framesNow = data.totalFrames ?? data.frameCount ?? 0;
            const previousFrameCount = previousFrameCountRef.current[target.cameraId] ?? framesNow;
            const fps = Math.max(framesNow - previousFrameCount, 0);

            previousFrameCountRef.current[target.cameraId] = framesNow;

            return {
              cameraId: target.cameraId,
              status: data.active && data.lastFrame ? 'connected' : 'waiting',
              fps,
              latency: data.lastFrame ? Math.max(Date.now() - data.lastFrame, 0) : 0,
              totalFrames: framesNow,
              error: null,
            };
          } catch {
            return {
              cameraId: target.cameraId,
              status: 'error',
              fps: 0,
              latency: 0,
              totalFrames: 0,
              error: 'Failed to fetch metadata for this stream.',
            };
          }
        })
      );

      const hasAnyHealthyStream = updates.some((update) => update.status !== 'error');
      if (!hasAnyHealthyStream) {
        setError('Failed to fetch stream metadata. Ensure backend is running.');
      } else {
        setError(null);
      }

      setStreamStats((prev) => {
        const next = { ...prev };
        updates.forEach((update) => {
          next[update.cameraId] = update;
        });
        return next;
      });
    };

    fetchStreamMetadata();
    metadataIntervalRef.current = setInterval(fetchStreamMetadata, 1000);

    return () => {
      if (metadataIntervalRef.current) {
        clearInterval(metadataIntervalRef.current);
      }
    };
  }, [backendUrl, streamTargets]);

  const copyToClipboard = async (value, successMessage = 'URL copied to clipboard!') => {
    try {
      await navigator.clipboard.writeText(value);
      alert(successMessage);
    } catch {
      alert('Unable to copy URL automatically.');
    }
  };

  const copyAllPublishedLinks = async () => {
    const linksBlob = streamTargets
      .map((target) => {
        const streamUrl = `${normalizedBackendUrl}/live/${target.streamId}`;
        return `${target.name} (${target.streamId}): ${streamUrl}`;
      })
      .join('\n');

    await copyToClipboard(linksBlob, 'All published links copied to clipboard!');
  };

  const resolveCardStatus = (cameraId) => {
    if (imageErrors[cameraId]) {
      return 'error';
    }

    return streamStats[cameraId]?.status || 'waiting';
  };

  const resolveStatusLabel = (status) => {
    if (status === 'connected') {
      return 'Connected';
    }

    if (status === 'error') {
      return 'Error';
    }

    return 'Waiting';
  };

  return (
    <div className="stream-viewer">
      <h2>👁️ View Live Streams</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="streams-grid">
        {streamTargets.map((target) => {
          const stats = streamStats[target.cameraId] || {
            status: 'waiting',
            fps: 0,
            latency: 0,
            totalFrames: 0,
            error: null,
          };
          const streamUrl = `${normalizedBackendUrl}/live/${target.streamId}`;
          const cardStatus = resolveCardStatus(target.cameraId);

          return (
            <article key={target.cameraId} className="stream-card">
              <div className="stream-card-header">
                <div>
                  <h3>{target.name}</h3>
                  <p>
                    Stream ID: <code>{target.streamId}</code>
                  </p>
                </div>
                <span className={`status-pill ${cardStatus}`}>
                  {resolveStatusLabel(cardStatus)}
                </span>
              </div>

              <div className="stream-wrapper">
                <img
                  alt={`${target.name} live stream`}
                  className="stream-image"
                  src={streamUrl}
                  onLoad={() => {
                    setImageErrors((previous) => ({
                      ...previous,
                      [target.cameraId]: false,
                    }));
                  }}
                  onError={() => {
                    setImageErrors((previous) => ({
                      ...previous,
                      [target.cameraId]: true,
                    }));
                  }}
                />
                {cardStatus === 'connected' && <span className="live-badge">🔴 LIVE</span>}
              </div>

              <div className="stream-stats">
                <div className="stat-item">
                  <span className="label">Frames/sec:</span>
                  <span className="value">{stats.fps}</span>
                </div>
                <div className="stat-item">
                  <span className="label">Latency:</span>
                  <span className="value">{stats.latency}ms</span>
                </div>
                <div className="stat-item">
                  <span className="label">Total Frames:</span>
                  <span className="value">{stats.totalFrames}</span>
                </div>
              </div>

              {stats.error && <div className="feed-error">{stats.error}</div>}

              <div className="stream-url-row">
                <code>{streamUrl}</code>
                <button className="copy-btn" onClick={() => copyToClipboard(streamUrl)}>
                  📋 Copy URL
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="published-links">
        <div className="published-links-header">
          <h3>🔗 Published Stream Links</h3>
          <button className="copy-btn" onClick={copyAllPublishedLinks}>
            📋 Copy All Links
          </button>
        </div>

        <div className="published-links-list">
          {streamTargets.map((target) => {
            const streamUrl = `${normalizedBackendUrl}/live/${target.streamId}`;

            return (
              <div key={`published-${target.cameraId}`} className="published-link-item">
                <div className="published-link-meta">
                  <strong>{target.name}</strong>
                  <span>
                    Streaming ID: <code>{target.streamId}</code>
                  </span>
                </div>

                <div className="published-link-actions">
                  <code>{streamUrl}</code>
                  <button className="copy-btn" onClick={() => copyToClipboard(streamUrl)}>
                    Copy
                  </button>
                  <a
                    className="open-link-btn"
                    href={streamUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="stream-url usage-section">
        <h3>💡 Multi-feed usage</h3>
        <div className="usage-example">
          <h4>Embed one stream in HTML:</h4>
          <pre>{`<img src="${normalizedBackendUrl}/live/<stream-id>" alt="Live Stream" />`}</pre>

          <h4>Fetch all configured stream IDs from this app:</h4>
          <pre>{`Configured streams: ${streamTargets.map((target) => target.streamId).join(', ')}`}</pre>
        </div>
      </div>
    </div>
  );
}

export default StreamViewer;
