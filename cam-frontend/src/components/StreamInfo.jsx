import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './StreamInfo.css';

const normalizeStreamId = (value) => {
  const safeValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeValue || 'default';
};

function StreamInfo({ backendUrl, streamId, cameras = [] }) {
  const [streamData, setStreamData] = useState(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const configuredStreamIds = useMemo(() => {
    const seen = new Set();
    const streamIds = [];

    cameras.forEach((camera) => {
      const normalized = normalizeStreamId(camera.streamId);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        streamIds.push(normalized);
      }
    });

    if (streamIds.length === 0) {
      streamIds.push(normalizeStreamId(streamId));
    }

    return streamIds;
  }, [cameras, streamId]);

  const [selectedStreamId, setSelectedStreamId] = useState(normalizeStreamId(streamId));

  useEffect(() => {
    const preferredStreamId = normalizeStreamId(streamId);
    if (configuredStreamIds.includes(preferredStreamId)) {
      setSelectedStreamId(preferredStreamId);
      return;
    }

    if (!configuredStreamIds.includes(selectedStreamId)) {
      setSelectedStreamId(configuredStreamIds[0]);
    }
  }, [streamId, configuredStreamIds, selectedStreamId]);

  const fetchStreamInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stream info
      const response = await fetch(`${backendUrl}/stream/${selectedStreamId}`);
      if (!response.ok) throw new Error('Stream not found');

      const data = await response.json();
      setStreamData(data);
    } catch (err) {
      setError(err.message);
      setStreamData(null);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, selectedStreamId]);

  const fetchAllStreams = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/streams`);
      if (!response.ok) throw new Error('Failed to fetch streams');

      const data = await response.json();
      setStreams(data.streams || []);
    } catch (err) {
      console.error('Error fetching streams:', err);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchStreamInfo();
    fetchAllStreams();

    const interval = setInterval(() => {
      fetchStreamInfo();
      fetchAllStreams();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchAllStreams, fetchStreamInfo]);

  const stopStream = async () => {
    try {
      const response = await fetch(`${backendUrl}/stream/${selectedStreamId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setStreamData(null);
        alert('Stream stopped successfully');
        fetchAllStreams();
      }
    } catch (err) {
      alert('Failed to stop stream: ' + err.message);
    }
  };

  return (
    <div className="stream-info">
      <h2>ℹ️ Stream Information</h2>

      <div className="stream-selector">
        <label htmlFor="stream-selector">Inspect stream:</label>
        <select
          id="stream-selector"
          value={selectedStreamId}
          onChange={(e) => setSelectedStreamId(e.target.value)}
        >
          {configuredStreamIds.map((configuredStreamId) => (
            <option key={configuredStreamId} value={configuredStreamId}>
              {configuredStreamId}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && <div className="loading">Loading...</div>}

      {streamData && (
        <div className="info-card">
          <div className="card-header">
            <h3>Current Stream: {streamData.streamId}</h3>
            <button className="btn-danger" onClick={stopStream}>
              🛑 Stop Stream
            </button>
          </div>

          <div className="info-grid">
            <div className="info-item">
              <span className="label">Stream ID:</span>
              <span className="value">{streamData.streamId}</span>
            </div>
            <div className="info-item">
              <span className="label">Status:</span>
              <span className={`value ${streamData.active ? 'active' : 'inactive'}`}>
                {streamData.active ? '✅ Active' : '⚫ Inactive'}
              </span>
            </div>
            <div className="info-item">
              <span className="label">Frame Count:</span>
              <span className="value">{streamData.frameCount}</span>
            </div>
            <div className="info-item">
              <span className="label">Created At:</span>
              <span className="value">{new Date(streamData.createdAt).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <span className="label">MJPEG URL:</span>
              <span className="value code">{streamData.mjpegUrl}</span>
            </div>
            <div className="info-item">
              <span className="label">Full URL:</span>
              <span className="value code">{backendUrl}{streamData.mjpegUrl}</span>
            </div>
          </div>
        </div>
      )}

      <div className="streams-list">
        <h3>📊 All Active Streams</h3>
        {streams.length === 0 ? (
          <div className="empty-message">No active streams</div>
        ) : (
          <div className="table-wrapper">
            <table className="streams-table">
              <thead>
                <tr>
                  <th>Stream ID</th>
                  <th>Status</th>
                  <th>Frames</th>
                  <th>Created</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {streams.map(stream => (
                  <tr key={stream.streamId}>
                    <td><code>{stream.streamId}</code></td>
                    <td>
                      <span className={`badge ${stream.active ? 'active' : 'inactive'}`}>
                        {stream.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{stream.frameCount}</td>
                    <td>{new Date(stream.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <code className="url-code">{backendUrl}/live/{stream.streamId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="api-section">
        <h3>🔌 API Endpoints</h3>
        <div className="endpoint">
          <div className="method">POST</div>
          <div className="path">/api/stream/chunk</div>
          <div className="desc">Upload video frame (used by frontend)</div>
        </div>
        <div className="endpoint">
          <div className="method">GET</div>
          <div className="path">/live/:streamId</div>
          <div className="desc">MJPEG stream (use this URL for external access)</div>
        </div>
        <div className="endpoint">
          <div className="method">GET</div>
          <div className="path">/stream/:streamId</div>
          <div className="desc">Stream metadata and info</div>
        </div>
        <div className="endpoint">
          <div className="method">GET</div>
          <div className="path">/streams</div>
          <div className="desc">List all active streams</div>
        </div>
        <div className="endpoint">
          <div className="method">DELETE</div>
          <div className="path">/stream/:streamId</div>
          <div className="desc">Stop/delete a stream</div>
        </div>
        <div className="endpoint">
          <div className="method">GET</div>
          <div className="path">/health</div>
          <div className="desc">Health check endpoint</div>
        </div>
      </div>

      <div className="notes-section">
        <h3>📝 Notes</h3>
        <ul>
          <li>Replace <code>:streamId</code> with your stream ID (e.g., "default")</li>
          <li>The stream URL is in MJPEG format and works in any browser</li>
          <li>Frame data is kept in memory - server restart will clear streams</li>
          <li>For production, consider adding authentication to the endpoints</li>
          <li>Maximum 30 frames are buffered for low latency streaming</li>
        </ul>
      </div>
    </div>
  );
}

export default StreamInfo;
