import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";
import { checkApiHealth } from "../services/api";
import {
  getApiBase,
  setApiBase,
  getSocketBase,
  setSocketBase,
} from "../services/config";
import { disconnectSocket } from "../services/socket";

export default function Settings() {
  const [apiBase, setApiBaseState] = useState(() => getApiBase());
  const [socketBase, setSocketBaseState] = useState(() => getSocketBase());
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function testConnection(base = apiBase) {
    const previous = getApiBase();
    setApiBase(base);
    const result = await checkApiHealth();
    if (!base) setApiBase(previous);
    else setApiBase(base);
    setStatus(result);
    return result;
  }

  useEffect(() => {
    testConnection(getApiBase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setApiBase(apiBase);
    setSocketBase(socketBase);
    disconnectSocket();
    const result = await testConnection(apiBase);
    setSaving(false);
    if (result.ok) {
      setStatus({
        ...result,
        message: "Connected. Create auction and live stage can use this API.",
      });
    }
  }

  return (
    <div className="app-frame">
      <TopBar
        subtitle="Connection settings"
        actions={
          <>
            <Link className="btn btn-ghost" to="/admin">
              Admin
            </Link>
            <Link className="btn btn-ghost" to="/">
              Home
            </Link>
          </>
        }
      />
      <div className="shell">
        <div className="panel" style={{ maxWidth: 640 }}>
          <h2>Backend connection</h2>
          <p className="hint">
            Create auction failed on Vercel because the old Railway API is offline.
            Point this app at a running KPL Auction API (Render / Railway / Docker),
            then save. Leave blank to use same-origin (when UI is served by the Node server).
          </p>

          <div className="field">
            <label>API base URL</label>
            <input
              value={apiBase}
              onChange={(e) => setApiBaseState(e.target.value)}
              placeholder="https://your-api.onrender.com"
            />
          </div>
          <div className="field">
            <label>Socket URL (usually same as API)</label>
            <input
              value={socketBase}
              onChange={(e) => setSocketBaseState(e.target.value)}
              placeholder="https://your-api.onrender.com"
            />
          </div>

          <div className="btn-row">
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save & test"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => testConnection(apiBase)}
              type="button"
            >
              Test only
            </button>
          </div>

          {status && (
            <div
              className={`banner ${status.ok ? "ok" : "error"}`}
              style={{ marginTop: 16 }}
            >
              {status.ok
                ? `Connected to ${status.base || "same-origin"}`
                : `Not connected (${status.base}): ${status.error}`}
              {status.message ? ` — ${status.message}` : ""}
            </div>
          )}

          <p className="hint" style={{ marginTop: 18, marginBottom: 0 }}>
            Deploy API with the included Dockerfile / render.yaml, set
            ADMIN_USERNAME / ADMIN_PASSWORD, then paste the public URL here.
          </p>
        </div>
      </div>
    </div>
  );
}
