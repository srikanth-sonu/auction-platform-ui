import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { checkApiHealth } from "../services/api";
import TopBar from "../components/TopBar";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    checkApiHealth().then(setHealth);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/api/auction/login", { username, password });
      localStorage.setItem("admin_logged", "true");
      localStorage.setItem("admin_user", username);
      localStorage.setItem("admin_pass", password);
      navigate("/admin");
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Login failed";
      setError(
        msg.includes("Network") || !err.response
          ? "Cannot reach API. Open Settings and set your backend URL."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-frame">
      <TopBar
        subtitle="Admin access"
        actions={
          <>
            <Link className="btn btn-ghost" to="/settings">
              Settings
            </Link>
            <Link className="btn btn-ghost" to="/">
              Home
            </Link>
          </>
        }
      />
      <div className="login-wrap">
        <div className="panel login-panel">
          <div className="brand-mark">KPL Auction</div>
          <h2 style={{ marginTop: 8 }}>Admin sign in</h2>
          <p className="hint">Manage clubs, rosters, and the live auction board.</p>

          {health && !health.ok && (
            <div className="banner error">
              API offline ({health.base}).{" "}
              <Link to="/settings">Fix connection</Link>
            </div>
          )}
          {health?.ok && (
            <div className="banner ok">API connected ({health.base || "same-origin"})</div>
          )}

          <form onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <div className="banner error">{error}</div>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Enter console"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
