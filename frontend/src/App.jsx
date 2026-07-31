import { useEffect, useMemo, useState } from "react";
import api from "./services/api";
import { getSocket } from "./services/socket";

const ROLE_LABELS = {
  BAT: "Batsman",
  BOWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicket-keeper",
};

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function parsePlayerLines(text, defaultBase) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // name | role | basePrice   OR   name, role, basePrice
      const parts = line.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      const name = parts[0];
      const roleRaw = (parts[1] || "BAT").toUpperCase();
      const roleMap = {
        BAT: "BAT",
        BATSMAN: "BAT",
        BOWL: "BOWL",
        BOWLER: "BOWL",
        AR: "AR",
        "ALL-ROUNDER": "AR",
        ALLROUNDER: "AR",
        WK: "WK",
        "WICKET-KEEPER": "WK",
        KEEPER: "WK",
      };
      return {
        name,
        role: roleMap[roleRaw] || "BAT",
        basePrice: Number(parts[2]) || defaultBase,
      };
    });
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
          <div className="brand-sub">Tournament player auction console</div>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 440 }}>
        <h2>Admin sign in</h2>
        <p className="hint">
          Run the live auction: roster → bid → sell → squad summary.
        </p>
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

  const [auctions, setAuctions] = useState([]);
  const [auctionId, setAuctionId] = useState("");
  const [live, setLive] = useState(null);
  const [players, setPlayers] = useState([]);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");

  // create form
  const [newName, setNewName] = useState("");
  const [newTeams, setNewTeams] = useState("");
  const [newBudget, setNewBudget] = useState("35000");
  const [newBase, setNewBase] = useState("500");
  const [newIncrement, setNewIncrement] = useState("100");
  const [newMaxSquad, setNewMaxSquad] = useState("11");
  const [newPlayersText, setNewPlayersText] = useState("");

  // roster add
  const [rosterText, setRosterText] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickRole, setQuickRole] = useState("BAT");
  const [quickBase, setQuickBase] = useState(500);
  const [selectedBidder, setSelectedBidder] = useState("");

  const availablePlayers = useMemo(
    () => players.filter((p) => p.status === "AVAILABLE"),
    [players]
  );

  async function refreshAuctions() {
    const res = await api.get("/api/auction");
    setAuctions(res.data || []);
  }

  async function refreshPlayers(id = auctionId) {
    if (!id) return;
    const res = await api.get(`/api/auction/${id}/players`);
    setPlayers(res.data || []);
  }

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    api
      .get("/api/auction")
      .then((res) => {
        if (active) setAuctions(res.data || []);
      })
      .catch(() => {
        if (active) setAuctions([]);
      });
    return () => {
      active = false;
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || !auctionId) return;

    let active = true;
    const socket = getSocket();
    socket.emit("auction:join", { auctionId: Number(auctionId) });

    Promise.all([
      api.get(`/api/auction/${auctionId}/state`),
      api.get(`/api/auction/${auctionId}/players`),
    ]).then(([stateRes, playersRes]) => {
      if (!active) return;
      setLive(stateRes.data);
      setPlayers(playersRes.data || []);
      if (stateRes.data?.leadingTeam?.id) {
        setSelectedBidder(String(stateRes.data.leadingTeam.id));
      }
      if (stateRes.data?.basePrice) setQuickBase(stateRes.data.basePrice);
    });

    const refreshRoster = () => {
      api.get(`/api/auction/${auctionId}/players`).then((res) => {
        if (active) setPlayers(res.data || []);
      });
    };

    const onLive = (data) => {
      if (data?.id && Number(data.id) !== Number(auctionId)) return;
      setLive(data);
      if (data?.leadingTeam?.id) setSelectedBidder(String(data.leadingTeam.id));
      setActionError("");
      refreshRoster();
    };

    const onError = (data) => setActionError(data?.message || "Action failed");

    socket.on("auction:live", onLive);
    socket.on("player:update", onLive);
    socket.on("player:sold", onLive);
    socket.on("player:unsold", onLive);
    socket.on("error", onError);

    return () => {
      active = false;
      socket.off("auction:live", onLive);
      socket.off("player:update", onLive);
      socket.off("player:sold", onLive);
      socket.off("player:unsold", onLive);
      socket.off("error", onError);
    };
  }, [loggedIn, auctionId]);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  function logout() {
    localStorage.clear();
    setLoggedIn(false);
  }

  async function createAuction() {
    setActionError("");
    setActionOk("");
    const teams = newTeams
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const playersList = parsePlayerLines(newPlayersText, Number(newBase) || 500);

    if (!newName.trim() || !teams.length || !newBudget) {
      setActionError("Name, teams, and budget are required");
      return;
    }

    try {
      const res = await api.post("/api/auction", {
        name: newName.trim(),
        teams,
        budget: Number(newBudget),
        basePrice: Number(newBase) || 500,
        bidIncrement: Number(newIncrement) || 100,
        maxSquadSize: Number(newMaxSquad) || 0,
        players: playersList,
      });
      setActionOk(`Created auction #${res.data.auctionId}`);
      setNewName("");
      setNewTeams("");
      setNewPlayersText("");
      await refreshAuctions();
      setAuctionId(String(res.data.auctionId));
    } catch (err) {
      setActionError(err.response?.data?.error || "Create failed");
    }
  }

  async function startAuction() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/start`);
      setLive(res.data);
      setActionOk("Auction is LIVE");
    } catch (err) {
      setActionError(err.response?.data?.error || "Could not start");
    }
  }

  async function endAuction() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/end`);
      setLive(res.data);
      setActionOk("Auction completed");
      await refreshAuctions();
    } catch (err) {
      setActionError(err.response?.data?.error || "Could not end");
    }
  }

  async function deleteAuction() {
    if (!auctionId) return;
    if (!window.confirm("Delete this auction and all its data?")) return;
    try {
      await api.delete(`/api/auction/${auctionId}`);
      setAuctionId("");
      setLive(null);
      setPlayers([]);
      setActionOk("Auction deleted");
      await refreshAuctions();
    } catch (err) {
      setActionError(err.response?.data?.error || "Delete failed");
    }
  }

  async function addRosterPlayers() {
    const list = parsePlayerLines(
      rosterText,
      Number(live?.basePrice || quickBase || 500)
    );
    if (!list.length) {
      setActionError("Add at least one player line");
      return;
    }
    try {
      await api.post(`/api/auction/${auctionId}/players`, { players: list });
      setRosterText("");
      setActionOk(`Added ${list.length} player(s)`);
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Could not add players");
    }
  }

  async function addQuickPlayerAndSet() {
    if (!quickName.trim()) {
      setActionError("Enter a player name");
      return;
    }
    try {
      const created = await api.post(`/api/auction/${auctionId}/players`, {
        name: quickName.trim(),
        role: quickRole,
        basePrice: Number(quickBase) || 500,
      });
      const playerId = created.data.ids?.[0];
      const res = await api.post(`/api/auction/${auctionId}/set-player`, {
        playerId,
      });
      setLive(res.data);
      setQuickName("");
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Failed to set player");
    }
  }

  async function setPlayerFromRoster(playerId) {
    try {
      const res = await api.post(`/api/auction/${auctionId}/set-player`, {
        playerId,
      });
      setLive(res.data);
      setSelectedBidder("");
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Failed to set player");
    }
  }

  async function placeBid(direction, teamId) {
    try {
      const res = await api.post(`/api/auction/${auctionId}/bid`, {
        direction,
        teamId: teamId || selectedBidder || undefined,
      });
      setLive(res.data);
    } catch (err) {
      setActionError(err.response?.data?.error || "Bid failed");
    }
  }

  async function bidForTeam(teamId) {
    setSelectedBidder(String(teamId));
    await placeBid("up", teamId);
  }

  async function sellPlayer() {
    const teamId = selectedBidder || live?.leadingTeam?.id;
    if (!teamId) {
      setActionError("Select the winning team");
      return;
    }
    try {
      const res = await api.post(`/api/auction/${auctionId}/sell`, { teamId });
      setLive(res.data);
      setSelectedBidder("");
      setActionOk(
        `Sold ${res.data.lastSold?.playerName} to ${res.data.lastSold?.teamName}`
      );
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Sell failed");
    }
  }

  async function markUnsold() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/unsold`);
      setLive(res.data);
      setSelectedBidder("");
      setActionOk(`Unsold: ${res.data.lastUnsold?.playerName || "player"}`);
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Unsold failed");
    }
  }

  async function removePlayer(playerId) {
    try {
      await api.delete(`/api/auction/${auctionId}/players/${playerId}`);
      await refreshPlayers();
    } catch (err) {
      setActionError(err.response?.data?.error || "Delete failed");
    }
  }

  const increment = live?.bidIncrement || Number(newIncrement) || 100;

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <div className="brand-mark">KPL Auction</div>
          <div className="brand-sub">
            Admin console
            {live?.status ? ` · ${live.status}` : ""}
            {live?.counts
              ? ` · ${live.counts.sold}/${live.counts.total} sold`
              : ""}
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
                Live screen
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

      {(actionError || actionOk) && (
        <div className="panel" style={{ marginBottom: 18, padding: 14 }}>
          {actionError && <p className="error-text" style={{ margin: 0 }}>{actionError}</p>}
          {actionOk && !actionError && (
            <p className="success-text" style={{ margin: 0 }}>{actionOk}</p>
          )}
        </div>
      )}

      <div className="grid-2">
        <section className="panel">
          <h2>1. Create tournament</h2>
          <p className="hint">
            Teams, purse, optional player roster. One line per player:
            <code> Name | Role | Base </code>
          </p>

          <div className="field">
            <label>Auction name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="KPL 2026"
            />
          </div>
          <div className="field">
            <label>Teams (comma separated)</label>
            <input
              value={newTeams}
              onChange={(e) => setNewTeams(e.target.value)}
              placeholder="Warriors, Titans, Strikers, Knights"
            />
          </div>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label>Budget / team</label>
              <input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Default base price</label>
              <input
                type="number"
                value={newBase}
                onChange={(e) => setNewBase(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Bid increment</label>
              <input
                type="number"
                value={newIncrement}
                onChange={(e) => setNewIncrement(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Max squad size (0 = no limit)</label>
              <input
                type="number"
                value={newMaxSquad}
                onChange={(e) => setNewMaxSquad(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Player roster (optional)</label>
            <textarea
              rows={5}
              value={newPlayersText}
              onChange={(e) => setNewPlayersText(e.target.value)}
              placeholder={"Rohit Sharma | BAT | 500\nBumrah | BOWL | 500\nJadeja | AR | 500"}
            />
          </div>
          <button className="btn" onClick={createAuction}>
            Create auction
          </button>
        </section>

        <section className="panel">
          <h2>2. Select & control</h2>
          <p className="hint">Pick the tournament, go live, open the audience screen.</p>

          <div className="field">
            <label>Auction</label>
            <select
              value={auctionId}
              onChange={(e) => {
                const next = e.target.value;
                setAuctionId(next);
                setLive(null);
                setPlayers([]);
                setActionError("");
                setActionOk("");
                setSelectedBidder("");
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
              disabled={!auctionId || live?.status === "LIVE"}
              onClick={startAuction}
            >
              Start LIVE
            </button>
            <button
              className="btn btn-ghost"
              disabled={!auctionId || live?.status === "COMPLETED"}
              onClick={endAuction}
            >
              End auction
            </button>
            <button
              className="btn btn-danger"
              disabled={!auctionId}
              onClick={deleteAuction}
            >
              Delete
            </button>
          </div>
        </section>
      </div>

      {auctionId && (
        <>
          <section className="panel">
            <h2>3. Player roster</h2>
            <p className="hint">
              Available queue. Click a player to put them on the block.
            </p>

            <div className="grid-2">
              <div>
                <div className="field">
                  <label>Bulk add (one per line)</label>
                  <textarea
                    rows={4}
                    value={rosterText}
                    onChange={(e) => setRosterText(e.target.value)}
                    placeholder={"Player | Role | Base"}
                  />
                </div>
                <button className="btn" onClick={addRosterPlayers}>
                  Add to roster
                </button>
              </div>

              <div>
                <div className="inline-row" style={{ gridTemplateColumns: "1.2fr 0.7fr 0.7fr auto" }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Quick player</label>
                    <input
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="Name"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Role</label>
                    <select
                      value={quickRole}
                      onChange={(e) => setQuickRole(e.target.value)}
                    >
                      <option value="BAT">BAT</option>
                      <option value="BOWL">BOWL</option>
                      <option value="AR">AR</option>
                      <option value="WK">WK</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Base</label>
                    <input
                      type="number"
                      value={quickBase}
                      onChange={(e) => setQuickBase(Number(e.target.value))}
                    />
                  </div>
                  <button className="btn" onClick={addQuickPlayerAndSet}>
                    Set now
                  </button>
                </div>
              </div>
            </div>

            <div className="roster-list">
              {availablePlayers.length === 0 && (
                <p className="muted">No available players in the queue.</p>
              )}
              {availablePlayers.map((p) => (
                <div className="roster-item" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <span className="muted">
                      {" "}
                      · {ROLE_LABELS[p.role] || p.role} · {formatMoney(p.base_price)}
                    </span>
                  </div>
                  <div className="btn-row">
                    <button className="btn" onClick={() => setPlayerFromRoster(p.id)}>
                      On block
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => removePlayer(p.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>4. Live bidding</h2>
            <p className="hint">
              Click a team to raise the bid for them, then sell or mark unsold.
            </p>

            <div className="bid-board">
              <div>
                <div className="muted">On the block</div>
                <h3 className="block-player">
                  {live?.currentPlayer?.name || "Waiting…"}
                </h3>
                {live?.currentPlayer && (
                  <div className="muted">
                    {ROLE_LABELS[live.currentPlayer.role] || live.currentPlayer.role}
                    {" · base "}
                    {formatMoney(live.currentPlayer.basePrice)}
                  </div>
                )}
                <div className="price" key={live?.currentPrice}>
                  {formatMoney(live?.currentPrice || 0)}
                </div>
                <div className="muted">
                  Leading:{" "}
                  <strong>
                    {live?.leadingTeam?.name || "No bidder yet"}
                  </strong>
                </div>
              </div>

              <div>
                <div className="btn-row" style={{ marginBottom: 14 }}>
                  <button
                    className="btn"
                    disabled={!live?.currentPlayer}
                    onClick={() => placeBid("up")}
                  >
                    +{increment}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={!live?.currentPlayer}
                    onClick={() => placeBid("down")}
                  >
                    −{increment}
                  </button>
                  <button
                    className="btn btn-gold"
                    disabled={!live?.currentPlayer}
                    onClick={sellPlayer}
                  >
                    Sold
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={!live?.currentPlayer}
                    onClick={markUnsold}
                  >
                    Unsold
                  </button>
                </div>

                <div className="team-bid-grid">
                  {(live?.teams || []).map((t) => (
                    <button
                      key={t.id}
                      className={`team-bid-btn ${
                        String(selectedBidder) === String(t.id) ? "active" : ""
                      }`}
                      disabled={!live?.currentPlayer}
                      onClick={() => bidForTeam(t.id)}
                    >
                      <strong>{t.name}</strong>
                      <span>{formatMoney(t.remaining_budget)} left</span>
                      <span>{t.player_count || 0} players</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
