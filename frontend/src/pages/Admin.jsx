import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "../services/api";
import ChipInput from "../components/ChipInput";
import TopBar from "../components/TopBar";
import ViewModeToggle from "../components/ViewModeToggle";
import useAuctionLive from "../hooks/useAuctionLive";
import { formatMoney, ROLE_LABELS, parsePlayerLines } from "../lib/format";

const SECTIONS = [
  { id: "create", label: "Create" },
  { id: "control", label: "Control" },
  { id: "roster", label: "Roster" },
  { id: "bidding", label: "Bidding" },
];

export default function Admin() {
  const navigate = useNavigate();
  const loggedIn = localStorage.getItem("admin_logged") === "true";

  const [section, setSection] = useState("create");
  const [auctions, setAuctions] = useState([]);
  const [auctionId, setAuctionId] = useState(
    () => localStorage.getItem("active_auction_id") || ""
  );
  const [message, setMessage] = useState("");
  const [selectedBidder, setSelectedBidder] = useState("");
  const [preferredLiveMode, setPreferredLiveMode] = useState(
    () => localStorage.getItem("live_view_mode") || "3d"
  );

  const [newName, setNewName] = useState("");
  const [teams, setTeams] = useState([]);
  const [newBudget, setNewBudget] = useState("35000");
  const [newBase, setNewBase] = useState("500");
  const [newIncrement, setNewIncrement] = useState("100");
  const [newMaxSquad, setNewMaxSquad] = useState("11");
  const [newPlayersText, setNewPlayersText] = useState("");

  const [rosterText, setRosterText] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickRole, setQuickRole] = useState("BAT");
  const [quickBase, setQuickBase] = useState(500);

  const { live, setLive, players, setPlayers, error, setError } =
    useAuctionLive(auctionId);

  const availablePlayers = useMemo(
    () => players.filter((p) => p.status === "AVAILABLE"),
    [players]
  );

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
    if (auctionId) localStorage.setItem("active_auction_id", auctionId);
    else localStorage.removeItem("active_auction_id");
  }, [auctionId]);

  useEffect(() => {
    localStorage.setItem("live_view_mode", preferredLiveMode);
  }, [preferredLiveMode]);

  if (!loggedIn) return <Navigate to="/login" replace />;

  function logout() {
    localStorage.removeItem("admin_logged");
    localStorage.removeItem("admin_user");
    localStorage.removeItem("admin_pass");
    navigate("/login");
  }

  async function refreshAuctions() {
    const res = await api.get("/api/auction");
    setAuctions(res.data || []);
  }

  async function refreshPlayers() {
    if (!auctionId) return;
    const res = await api.get(`/api/auction/${auctionId}/players`);
    setPlayers(res.data || []);
  }

  async function createAuction() {
    setError("");
    setMessage("");
    if (!newName.trim() || teams.length === 0 || !newBudget) {
      setError("Name, at least one team, and budget are required");
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
        players: parsePlayerLines(newPlayersText, Number(newBase) || 500),
      });
      setMessage(`Tournament #${res.data.auctionId} created`);
      setNewName("");
      setTeams([]);
      setNewPlayersText("");
      await refreshAuctions();
      setAuctionId(String(res.data.auctionId));
      setSection("control");
    } catch (err) {
      setError(err.response?.data?.error || "Create failed");
    }
  }

  async function startAuction() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/start`);
      setLive(res.data);
      setMessage("Auction is LIVE");
    } catch (err) {
      setError(err.response?.data?.error || "Could not start");
    }
  }

  async function endAuction() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/end`);
      setLive(res.data);
      setMessage("Auction completed");
      await refreshAuctions();
    } catch (err) {
      setError(err.response?.data?.error || "Could not end");
    }
  }

  async function deleteAuction() {
    if (!auctionId || !window.confirm("Delete this auction and all data?")) return;
    try {
      await api.delete(`/api/auction/${auctionId}`);
      setAuctionId("");
      setLive(null);
      setPlayers([]);
      setMessage("Auction deleted");
      await refreshAuctions();
    } catch (err) {
      setError(err.response?.data?.error || "Delete failed");
    }
  }

  async function addRosterPlayers() {
    const list = parsePlayerLines(rosterText, Number(live?.basePrice || quickBase || 500));
    if (!list.length) {
      setError("Add at least one player line");
      return;
    }
    try {
      await api.post(`/api/auction/${auctionId}/players`, { players: list });
      setRosterText("");
      setMessage(`Added ${list.length} player(s)`);
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add players");
    }
  }

  async function addQuickPlayerAndSet() {
    if (!quickName.trim()) {
      setError("Enter a player name");
      return;
    }
    try {
      const created = await api.post(`/api/auction/${auctionId}/players`, {
        name: quickName.trim(),
        role: quickRole,
        basePrice: Number(quickBase) || 500,
      });
      const playerId = created.data.ids?.[0];
      const res = await api.post(`/api/auction/${auctionId}/set-player`, { playerId });
      setLive(res.data);
      setQuickName("");
      setSection("bidding");
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to set player");
    }
  }

  async function setPlayerFromRoster(playerId) {
    try {
      const res = await api.post(`/api/auction/${auctionId}/set-player`, { playerId });
      setLive(res.data);
      setSelectedBidder("");
      setSection("bidding");
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to set player");
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
      setError(err.response?.data?.error || "Bid failed");
    }
  }

  async function bidForTeam(teamId) {
    setSelectedBidder(String(teamId));
    await placeBid("up", teamId);
  }

  async function sellPlayer() {
    const teamId = selectedBidder || live?.leadingTeam?.id;
    if (!teamId) {
      setError("Select the winning team");
      return;
    }
    try {
      const res = await api.post(`/api/auction/${auctionId}/sell`, { teamId });
      setLive(res.data);
      setSelectedBidder("");
      setMessage(`Sold ${res.data.lastSold?.playerName} to ${res.data.lastSold?.teamName}`);
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Sell failed");
    }
  }

  async function markUnsold() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/unsold`);
      setLive(res.data);
      setSelectedBidder("");
      setMessage(`Unsold: ${res.data.lastUnsold?.playerName || "player"}`);
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Unsold failed");
    }
  }

  async function removePlayer(playerId) {
    try {
      await api.delete(`/api/auction/${auctionId}/players/${playerId}`);
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Delete failed");
    }
  }

  const increment = live?.bidIncrement || Number(newIncrement) || 100;

  return (
    <div className="app-frame">
      <TopBar
        subtitle="Admin console"
        actions={
          <>
            <ViewModeToggle
              mode={preferredLiveMode}
              onChange={setPreferredLiveMode}
            />
            {auctionId && (
              <>
                <Link
                  className="btn btn-ghost"
                  to={`/live?auctionId=${auctionId}&mode=${preferredLiveMode}`}
                  target="_blank"
                >
                  Live stage
                </Link>
                <Link
                  className="btn btn-ghost"
                  to={`/summary?auctionId=${auctionId}`}
                  target="_blank"
                >
                  Summary
                </Link>
              </>
            )}
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </>
        }
      />

      <div className="shell">
        {(error || message) && (
          <div className="toast">
            {error ? (
              <p className="error-text">{error}</p>
            ) : (
              <p className="success-text">{message}</p>
            )}
          </div>
        )}

        {live && (
          <div className="stat-strip">
            <div className="stat-pill">
              <span className="muted">Status</span>
              <strong>{live.status || "—"}</strong>
            </div>
            <div className="stat-pill">
              <span className="muted">Available</span>
              <strong>{live.counts?.available ?? 0}</strong>
            </div>
            <div className="stat-pill">
              <span className="muted">Sold</span>
              <strong>{live.counts?.sold ?? 0}</strong>
            </div>
            <div className="stat-pill">
              <span className="muted">Unsold</span>
              <strong>{live.counts?.unsold ?? 0}</strong>
            </div>
          </div>
        )}

        <div className="admin-layout">
          <aside className="side-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={section === s.id ? "active" : ""}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </aside>

          <div>
            {section === "create" && (
              <section className="panel">
                <h2>Create tournament</h2>
                <p className="hint">
                  Add teams as cards — type a name and press Enter. No comma lists.
                </p>

                <div className="field">
                  <label>Auction name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="KPL 2026 Season Auction"
                  />
                </div>

                <div className="field">
                  <label>Teams</label>
                  <ChipInput
                    values={teams}
                    onChange={setTeams}
                    placeholder="Team name, then Enter"
                    addLabel="Add team"
                  />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Budget / team (₹)</label>
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
                    <label>Max squad size (0 = unlimited)</label>
                    <input
                      type="number"
                      value={newMaxSquad}
                      onChange={(e) => setNewMaxSquad(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Optional roster (one per line: Name | Role | Base)</label>
                  <textarea
                    value={newPlayersText}
                    onChange={(e) => setNewPlayersText(e.target.value)}
                    placeholder={"Rohit Sharma | BAT | 500\nBumrah | BOWL | 500"}
                  />
                </div>

                <button className="btn" onClick={createAuction}>
                  Create auction
                </button>
              </section>
            )}

            {section === "control" && (
              <section className="panel">
                <h2>Select & control</h2>
                <p className="hint">
                  Choose the tournament, go live, and open the 2D/3D stage.
                </p>

                <div className="field">
                  <label>Auction</label>
                  <select
                    value={auctionId}
                    onChange={(e) => {
                      setAuctionId(e.target.value);
                      setLive(null);
                      setPlayers([]);
                      setError("");
                      setMessage("");
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

                <div className="field">
                  <label>Preferred live stage mode</label>
                  <ViewModeToggle
                    mode={preferredLiveMode}
                    onChange={setPreferredLiveMode}
                  />
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
                  {auctionId && (
                    <Link
                      className="btn"
                      to={`/live?auctionId=${auctionId}&mode=${preferredLiveMode}`}
                      target="_blank"
                    >
                      Open live stage
                    </Link>
                  )}
                </div>
              </section>
            )}

            {section === "roster" && (
              <section className="panel">
                <h2>Player roster</h2>
                {!auctionId ? (
                  <p className="hint">Select an auction in Control first.</p>
                ) : (
                  <>
                    <p className="hint">
                      Queue players, then send one to the block.
                    </p>
                    <div className="grid-2">
                      <div>
                        <div className="field">
                          <label>Bulk add</label>
                          <textarea
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
                        <div className="grid-3">
                          <div className="field">
                            <label>Quick name</label>
                            <input
                              value={quickName}
                              onChange={(e) => setQuickName(e.target.value)}
                            />
                          </div>
                          <div className="field">
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
                          <div className="field">
                            <label>Base</label>
                            <input
                              type="number"
                              value={quickBase}
                              onChange={(e) => setQuickBase(Number(e.target.value))}
                            />
                          </div>
                        </div>
                        <button className="btn btn-gold" onClick={addQuickPlayerAndSet}>
                          Set on block now
                        </button>
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
                              · {ROLE_LABELS[p.role] || p.role} ·{" "}
                              {formatMoney(p.base_price)}
                            </span>
                          </div>
                          <div className="btn-row">
                            <button
                              className="btn btn-sm"
                              onClick={() => setPlayerFromRoster(p.id)}
                            >
                              On block
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => removePlayer(p.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {section === "bidding" && (
              <section className="panel">
                <h2>Live bidding</h2>
                {!auctionId ? (
                  <p className="hint">Select an auction in Control first.</p>
                ) : (
                  <>
                    <p className="hint">
                      Tap a team card to raise their bid, then Sold or Unsold.
                    </p>
                    <div className="bid-board">
                      <div>
                        <div className="muted">On the block</div>
                        <h3 className="block-player">
                          {live?.currentPlayer?.name || "Waiting…"}
                        </h3>
                        {live?.currentPlayer && (
                          <div className="muted">
                            {ROLE_LABELS[live.currentPlayer.role] ||
                              live.currentPlayer.role}
                            {" · base "}
                            {formatMoney(live.currentPlayer.basePrice)}
                          </div>
                        )}
                        <div className="price" key={live?.currentPrice}>
                          {formatMoney(live?.currentPrice || 0)}
                        </div>
                        <div className="muted">
                          Leading:{" "}
                          <strong>{live?.leadingTeam?.name || "No bidder yet"}</strong>
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
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
