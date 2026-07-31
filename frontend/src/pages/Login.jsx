import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import TopBar from "../components/TopBar";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-frame">
      <TopBar
        subtitle="Admin access"
        actions={
          <Link className="btn btn-ghost" to="/">
            Home
          </Link>
        }
      />
      <div className="login-wrap">
        <div className="panel login-panel">
          <div className="brand-mark" style={{ fontSize: "2.4rem" }}>
            KPL Auction
          </div>
          <h2 style={{ marginTop: 10 }}>Admin sign in</h2>
          <p className="hint">Control roster, bidding, and the live stage.</p>
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
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Enter console"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
