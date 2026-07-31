import { useEffect, useState } from "react";
import api from "./services/api";
import { getSocket } from "./services/socket";

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username || !password) {
      setLoginError("Username and password are required");
      return;
    }

    setLoading(true);
    setLoginError("");
    try {
      await api.post("/api/auction/login", { username, password });
      localStorage.setItem("admin_logged", "true");
      localStorage.setItem("admin_user", username);
      localStorage.setItem("admin_pass", password);
      onLogin();
    } catch (err) {
      setLoginError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <div className="brand-mark">KPL Auction</div>
          <div className="brand-sub">Admin console</div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        <h2>Sign in</h2>
        <p className="hint">Control live player bidding for your tournament.</p>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {loginError && <p className="error-text">{loginError}</p>}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(
    () => localStorage.getItem("admin_logged") === "true"
  );

  const [newAuctionName, setNewAuctionName] = useState("");
  const [newTeams, setNewTeams] = useState("");
  const [newBudget, setNewBudget] = useState("35000");
  const [newBasePrice, setNewBasePrice] = useState("500");
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");

  const [auctions, setAuctions] = useState([]);
  const [auctionId, setAuctionId] = useState("");
  const [auctionStatus, setAuctionStatus] = useState("");

  const [playerName, setPlayerName] = useState("");
  const [basePrice, setBasePrice] = useState(500);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [currentPrice, setCurrentPrice] = useState(0);

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!loggedIn) return;
    api
      .get("/api/auction")
      .then((res) => setAuctions(res.data || []))
      .catch(() => setAuctions([]));
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || !auctionId) return;

    let active = true;
    const socket = getSocket();
    socket.emit("auction:join", { auctionId: Number(auctionId) });

    api.get(`/api/auction/${auctionId}/state`).then((res) => {
      if (!active) return;
      setAuctionStatus(res.data.status || "");
      setCurrentPlayer(res.data.currentPlayer || "");
      setCurrentPrice(res.data.currentPrice || 0);
      if (res.data.basePrice) setBasePrice(res.data.basePrice);
      if (res.data.currentPlayer) setPlayerName(res.data.currentPlayer);
    });

    api.get(`/api/auction/${auctionId}/teams`).then((res) => {
      if (active) setTeams(res.data || []);
    });

    const onPlayerUpdate = (data) => {
      if (data.auctionId && Number(data.auctionId) !== Number(auctionId)) return;
      if (data.playerName) {
        setCurrentPlayer(data.playerName);
        setPlayerName(data.playerName);
      }
      if (data.currentPrice !== undefined) setCurrentPrice(data.currentPrice);
      setActionError("");
    };

    const onPlayerSold = (data) => {
      if (data.auctionId && Number(data.auctionId) !== Number(auctionId)) return;
      setCurrentPlayer("");
      setCurrentPrice(0);
      setPlayerName("");
      setSelectedTeam("");
      setTeams((prev) =>
        prev.map((t) =>
          t.id === data.teamId
            ? { ...t, remaining_budget: data.remainingBudget }
            : t
        )
      );
    };

    const onPlayerUnsold = (data) => {
      if (data.auctionId && Number(data.auctionId) !== Number(auctionId)) return;
      setCurrentPlayer("");
      setCurrentPrice(0);
      setPlayerName("");
      setSelectedTeam("");
    };

    const onAuctionUpdate = (data) => {
      if (data.auctionId && Number(data.auctionId) !== Number(auctionId)) return;
      if (data.status) setAuctionStatus(data.status);
    };

    const onSocketError = (data) => {
      setActionError(data?.message || "Action failed");
    };

    socket.on("player:update", onPlayerUpdate);
    socket.on("player:sold", onPlayerSold);
    socket.on("player:unsold", onPlayerUnsold);
    socket.on("auction:update", onAuctionUpdate);
    socket.on("error", onSocketError);

    return () => {
      active = false;
      socket.off("player:update", onPlayerUpdate);
      socket.off("player:sold", onPlayerSold);
      socket.off("player:unsold", onPlayerUnsold);
      socket.off("auction:update", onAuctionUpdate);
      socket.off("error", onSocketError);
    };
  }, [loggedIn, auctionId]);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  async function refreshAuctions() {
    const res = await api.get("/api/auction");
    setAuctions(res.data || []);
  }

  async function createAuction() {
    setCreateError("");
    setCreateMessage("");

    const teams = newTeams
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!newAuctionName.trim() || teams.length === 0 || !newBudget) {
      setCreateError("Name, teams, and budget are required");
      return;
    }

    try {
      const res = await api.post("/api/auction", {
        name: newAuctionName.trim(),
        teams,
        budget: Number(newBudget),
        basePrice: Number(newBasePrice) || 500,
      });
      setCreateMessage(`Tournament created (ID ${res.data.auctionId})`);
      setNewAuctionName("");
      setNewTeams("");
      await refreshAuctions();
      setAuctionId(String(res.data.auctionId));
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create auction");
    }
  }

  function startAuction() {
    if (!auctionId) return;
    getSocket().emit("auction:start", { auctionId: Number(auctionId) });
    setAuctionStatus("LIVE");
  }

  function setPlayer() {
    if (!auctionId || !playerName.trim()) {
      setActionError("Select an auction and enter a player name");
      return;
    }
    getSocket().emit("player:set", {
      auctionId: Number(auctionId),
      playerName: playerName.trim(),
      basePrice: Number(basePrice) || 500,
    });
  }

  function bumpBid(delta) {
    if (!auctionId || !currentPlayer) return;
    const next = Math.max(Number(basePrice) || 500, currentPrice + delta);
    if (delta > 0) {
      getSocket().emit("bid:increase", {
        auctionId: Number(auctionId),
        amount: next,
      });
    } else {
      getSocket().emit("bid:decrease", {
        auctionId: Number(auctionId),
        amount: next,
      });
    }
  }

  function sellPlayer() {
    if (!auctionId || !selectedTeam) {
      setActionError("Select the winning team");
      return;
    }
    getSocket().emit("player:sell", {
      auctionId: Number(auctionId),
      teamId: Number(selectedTeam),
    });
  }

  function markUnsold() {
    if (!auctionId) return;
    getSocket().emit("player:unsold", { auctionId: Number(auctionId) });
  }

  function logout() {
    localStorage.removeItem("admin_logged");
    localStorage.removeItem("admin_user");
    localStorage.removeItem("admin_pass");
    setLoggedIn(false);
  }

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <div className="brand-mark">KPL Auction</div>
          <div className="brand-sub">
            Admin panel
            {auctionStatus ? ` · ${auctionStatus}` : ""}
          </div>
        </div>
        <div className="nav-links">
          {auctionId && (
            <>
              <a
                className="btn btn-ghost"
                href={`/public?auctionId=${auctionId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open live screen
              </a>
              <a
                className="btn btn-ghost"
                href={`/summary?auctionId=${auctionId}`}
                target="_blank"
                rel="noreferrer"
              >
                Summary
              </a>
            </>
          )}
          <button className="btn btn-ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Create tournament</h2>
          <p className="hint">Spin up a fresh auction with team purses.</p>

          <div className="field">
            <label>Auction name</label>
            <input
              placeholder="KPL 2026"
              value={newAuctionName}
              onChange={(e) => setNewAuctionName(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Teams (comma separated)</label>
            <input
              placeholder="Warriors, Titans, Strikers"
              value={newTeams}
              onChange={(e) => setNewTeams(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Budget per team (₹)</label>
            <input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Base price (₹)</label>
            <input
              type="number"
              value={newBasePrice}
              onChange={(e) => setNewBasePrice(e.target.value)}
            />
          </div>

          {createError && <p className="error-text">{createError}</p>}
          {createMessage && <p className="success-text">{createMessage}</p>}

          <button className="btn" onClick={createAuction}>
            Create auction
          </button>
        </section>

        <section className="panel">
          <h2>Select tournament</h2>
          <p className="hint">Choose which auction to run live.</p>

          <div className="field">
            <label>Auction</label>
            <select
              value={auctionId}
              onChange={(e) => {
                setAuctionId(e.target.value);
                setCurrentPlayer("");
                setCurrentPrice(0);
                setPlayerName("");
                setSelectedTeam("");
                setActionError("");
              }}
            >
              <option value="">-- Select auction --</option>
              {auctions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.status})
                </option>
              ))}
            </select>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-gold"
              disabled={!auctionId || auctionStatus === "LIVE"}
              onClick={startAuction}
            >
              Start auction
            </button>
          </div>
        </section>
      </div>

      {auctionId && (
        <>
          <section className="panel">
            <h2>Current player</h2>
            <p className="hint">
              Set the player on the block, then drive the bid from here.
            </p>

            <div className="inline-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Player name</label>
                <input
                  placeholder="Player name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Base / start (₹)</label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(Number(e.target.value))}
                />
              </div>
              <button className="btn" onClick={setPlayer}>
                Set player
              </button>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="muted">Now bidding</div>
              <h3 style={{ margin: "4px 0 0", fontSize: "1.8rem" }}>
                {currentPlayer || "Waiting…"}
              </h3>
              <div className="price" key={currentPrice}>
                {formatMoney(currentPrice)}
              </div>
            </div>

            <div className="btn-row">
              <button
                className="btn"
                disabled={!currentPlayer}
                onClick={() => bumpBid(100)}
              >
                +100
              </button>
              <button
                className="btn"
                disabled={!currentPlayer}
                onClick={() => bumpBid(200)}
              >
                +200
              </button>
              <button
                className="btn btn-ghost"
                disabled={!currentPlayer}
                onClick={() => bumpBid(-100)}
              >
                −100
              </button>
              <button
                className="btn btn-ghost"
                disabled={!currentPlayer}
                onClick={() => bumpBid(-200)}
              >
                −200
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Sell / unsold</h2>
            <p className="hint">Award the player to a team or mark unsold.</p>

            <div className="field">
              <label>Winning team</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
              >
                <option value="">-- Select team --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({formatMoney(t.remaining_budget)} left)
                  </option>
                ))}
              </select>
            </div>

            {actionError && <p className="error-text">{actionError}</p>}

            <div className="btn-row">
              <button
                className="btn btn-gold"
                disabled={!currentPlayer || !selectedTeam}
                onClick={sellPlayer}
              >
                Sell player
              </button>
              <button
                className="btn btn-danger"
                disabled={!currentPlayer}
                onClick={markUnsold}
              >
                Mark unsold
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
