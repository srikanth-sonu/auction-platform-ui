import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api, { checkApiHealth } from "../services/api";
import TeamBuilder from "../components/TeamBuilder";
import TopBar from "../components/TopBar";
import ViewModeToggle from "../components/ViewModeToggle";
import useAuctionLive from "../hooks/useAuctionLive";
import {
  formatMoney,
  ROLE_LABELS,
  CATEGORY_LABELS,
  parsePlayerLines,
} from "../lib/format";

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
  const [clubs, setClubs] = useState([]);
  const [auctionId, setAuctionId] = useState(
    () => localStorage.getItem("active_auction_id") || ""
  );
  const [message, setMessage] = useState("");
  const [selectedBidder, setSelectedBidder] = useState("");
  const [health, setHealth] = useState(null);
  const [preferredLiveMode, setPreferredLiveMode] = useState(
    () => localStorage.getItem("live_view_mode") || "2d"
  );

  const [clubName, setClubName] = useState("");
  const [clubId, setClubId] = useState("");
  const [newName, setNewName] = useState("");
  const [teams, setTeams] = useState([]);
  const [newBudget, setNewBudget] = useState("10000000");
  const [newBase, setNewBase] = useState("500000");
  const [newIncrement, setNewIncrement] = useState("50000");
  const [newMaxSquad, setNewMaxSquad] = useState("15");
  const [newMaxOverseas, setNewMaxOverseas] = useState("4");
  const [newTimer, setNewTimer] = useState("0");
  const [newPlayersText, setNewPlayersText] = useState("");

  const [rosterText, setRosterText] = useState("");
  const [csvText, setCsvText] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickRole, setQuickRole] = useState("BAT");
  const [quickCategory, setQuickCategory] = useState("UNCAPPED");
  const [quickCountry, setQuickCountry] = useState("LOCAL");
  const [quickBase, setQuickBase] = useState(500000);
  const [rosterFilter, setRosterFilter] = useState("");

  const { live, setLive, players, setPlayers, error, setError } =
    useAuctionLive(auctionId);

  const availablePlayers = useMemo(() => {
    const q = rosterFilter.trim().toLowerCase();
    return players
      .filter((p) => p.status === "AVAILABLE")
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [players, rosterFilter]);

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    checkApiHealth().then((h) => active && setHealth(h));
    Promise.all([
      api.get("/api/auction").catch(() => ({ data: [] })),
      api.get("/api/auction/clubs").catch(() => ({ data: [] })),
    ]).then(([a, c]) => {
      if (!active) return;
      setAuctions(a.data || []);
      setClubs(c.data || []);
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
      setError("Auction name, at least one team, and purse budget are required");
      return;
    }
    try {
      const res = await api.post("/api/auction", {
        name: newName.trim(),
        clubId: clubId || undefined,
        clubName: clubName.trim() || undefined,
        teams,
        budget: Number(newBudget),
        basePrice: Number(newBase) || 500,
        bidIncrement: Number(newIncrement) || 100,
        maxSquadSize: Number(newMaxSquad) || 0,
        maxOverseas: Number(newMaxOverseas) || 0,
        timerSeconds: Number(newTimer) || 0,
        players: parsePlayerLines(newPlayersText, Number(newBase) || 500),
      });
      setMessage(`Auction #${res.data.auctionId} created`);
      setNewName("");
      setTeams([]);
      setNewPlayersText("");
      await refreshAuctions();
      setAuctionId(String(res.data.auctionId));
      setSection("control");
      setHealth(await checkApiHealth());
    } catch (err) {
      setError(
        err.response?.data?.error ||
          (!err.response
            ? "Cannot reach API. Open Settings and connect your backend."
            : "Create failed")
      );
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

  async function importCsv() {
    if (!csvText.trim()) {
      setError("Paste CSV first");
      return;
    }
    try {
      const res = await api.post(`/api/auction/${auctionId}/players/import`, {
        csv: csvText,
      });
      setCsvText("");
      setMessage(`Imported ${res.data.createdCount} players`);
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "CSV import failed");
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
        category: quickCategory,
        countryType: quickCountry,
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

  async function nextPlayer(random = false) {
    try {
      const res = await api.post(`/api/auction/${auctionId}/next-player`, { random });
      setLive(res.data);
      setSelectedBidder("");
      setSection("bidding");
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "No player available");
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

  async function undoSale() {
    try {
      const res = await api.post(`/api/auction/${auctionId}/undo-sale`);
      setLive(res.data);
      setMessage("Last sale undone");
      await refreshPlayers();
    } catch (err) {
      setError(err.response?.data?.error || "Nothing to undo");
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

  const increment = live?.nextIncrement || live?.bidIncrement || Number(newIncrement) || 100;

  return (
    <div className="app-frame">
      <TopBar
        subtitle="Auction console"
        actions={
          <>
            <ViewModeToggle mode={preferredLiveMode} onChange={setPreferredLiveMode} />
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
            <Link className="btn btn-ghost" to="/settings">
              Settings
            </Link>
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </>
        }
      />

      <div className="shell">
        {health && !health.ok && (
          <div className="banner error">
            Backend not connected ({health.base}). Create auction will fail until you{" "}
            <Link to="/settings">set a working API URL</Link>.
          </div>
        )}
        {(error || message) && (
          <div className={`banner ${error ? "error" : "ok"}`}>
            {error || message}
          </div>
        )}

        {live && (
          <div className="stat-strip">
            <div className="stat-pill">
              <span>Status</span>
              <strong>{live.status || "—"}</strong>
            </div>
            <div className="stat-pill">
              <span>Available</span>
              <strong>{live.counts?.available ?? 0}</strong>
            </div>
            <div className="stat-pill">
              <span>Sold</span>
              <strong>{live.counts?.sold ?? 0}</strong>
            </div>
            <div className="stat-pill">
              <span>Unsold</span>
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
                <h2>Create club auction</h2>
                <p className="hint">
                  Add franchises as cards with code and color — no comma lists.
                </p>

                <div className="grid-2">
                  <div className="field">
                    <label>Club (optional existing)</label>
                    <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
                      <option value="">New / none</option>
                      {clubs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Or new club name</label>
                    <input
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      placeholder="City Super Giants CC"
                      disabled={Boolean(clubId)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Auction name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Season 2026 Mega Auction"
                  />
                </div>

                <div className="field">
                  <label>Franchises / teams</label>
                  <TeamBuilder teams={teams} onChange={setTeams} />
                </div>

                <div className="grid-3">
                  <div className="field">
                    <label>Purse / team (₹)</label>
                    <input type="number" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Default base price</label>
                    <input type="number" value={newBase} onChange={(e) => setNewBase(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Base bid increment</label>
                    <input type="number" value={newIncrement} onChange={(e) => setNewIncrement(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Max squad size</label>
                    <input type="number" value={newMaxSquad} onChange={(e) => setNewMaxSquad(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Max overseas / team</label>
                    <input type="number" value={newMaxOverseas} onChange={(e) => setNewMaxOverseas(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Bid timer (seconds, 0=off)</label>
                    <input type="number" value={newTimer} onChange={(e) => setNewTimer(e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Optional roster (Name | Role | Category | LOCAL/OVERSEAS | Base)</label>
                  <textarea
                    value={newPlayersText}
                    onChange={(e) => setNewPlayersText(e.target.value)}
                    placeholder={"Virat Kohli | BAT | CAPPED | LOCAL | 2000000\nRashid Khan | BOWL | CAPPED | OVERSEAS | 1500000"}
                  />
                </div>

                <button className="btn" onClick={createAuction}>
                  Create auction
                </button>
              </section>
            )}

            {section === "control" && (
              <section className="panel">
                <h2>Select & broadcast</h2>
                <p className="hint">Pick the auction, go live, open the stage.</p>
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
                        {a.club_name ? `${a.club_name} · ` : ""}
                        {a.name} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Live stage mode</label>
                  <ViewModeToggle mode={preferredLiveMode} onChange={setPreferredLiveMode} />
                </div>
                <div className="btn-row">
                  <button className="btn btn-gold" disabled={!auctionId || live?.status === "LIVE"} onClick={startAuction}>
                    Start LIVE
                  </button>
                  <button className="btn btn-ghost" disabled={!auctionId || live?.status === "COMPLETED"} onClick={endAuction}>
                    End auction
                  </button>
                  <button className="btn btn-danger" disabled={!auctionId} onClick={deleteAuction}>
                    Delete
                  </button>
                  {auctionId && (
                    <Link className="btn" to={`/live?auctionId=${auctionId}&mode=${preferredLiveMode}`} target="_blank">
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
                    <div className="btn-row" style={{ marginBottom: 14 }}>
                      <button className="btn" onClick={() => nextPlayer(false)}>
                        Next player
                      </button>
                      <button className="btn btn-ghost" onClick={() => nextPlayer(true)}>
                        Random player
                      </button>
                    </div>
                    <div className="grid-2">
                      <div>
                        <div className="field">
                          <label>Bulk add lines</label>
                          <textarea value={rosterText} onChange={(e) => setRosterText(e.target.value)} placeholder={"Player | Role | Category | LOCAL/OVERSEAS | Base"} />
                        </div>
                        <button className="btn" onClick={addRosterPlayers}>Add to roster</button>
                      </div>
                      <div>
                        <div className="field">
                          <label>CSV import (Name,Role,Category,Country,Base)</label>
                          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"name,role,category,country,base\n..."} />
                        </div>
                        <button className="btn btn-ghost" onClick={importCsv}>Import CSV</button>
                      </div>
                    </div>

                    <div className="grid-3" style={{ marginTop: 16 }}>
                      <div className="field">
                        <label>Quick name</label>
                        <input value={quickName} onChange={(e) => setQuickName(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Role</label>
                        <select value={quickRole} onChange={(e) => setQuickRole(e.target.value)}>
                          <option value="BAT">BAT</option>
                          <option value="BOWL">BOWL</option>
                          <option value="AR">AR</option>
                          <option value="WK">WK</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Category</label>
                        <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)}>
                          {Object.keys(CATEGORY_LABELS).map((k) => (
                            <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Country</label>
                        <select value={quickCountry} onChange={(e) => setQuickCountry(e.target.value)}>
                          <option value="LOCAL">Local</option>
                          <option value="OVERSEAS">Overseas</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Base</label>
                        <input type="number" value={quickBase} onChange={(e) => setQuickBase(Number(e.target.value))} />
                      </div>
                      <div className="field">
                        <label>&nbsp;</label>
                        <button className="btn btn-gold" onClick={addQuickPlayerAndSet}>Set on block</button>
                      </div>
                    </div>

                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Filter available</label>
                      <input value={rosterFilter} onChange={(e) => setRosterFilter(e.target.value)} placeholder="Search player" />
                    </div>

                    <div className="roster-list">
                      {availablePlayers.length === 0 && <p className="muted">No available players.</p>}
                      {availablePlayers.map((p) => (
                        <div className="roster-item" key={p.id}>
                          <div>
                            <strong>{p.name}</strong>{" "}
                            <span className="tag">{ROLE_LABELS[p.role] || p.role}</span>{" "}
                            <span className="tag">{CATEGORY_LABELS[p.category] || p.category}</span>{" "}
                            <span className="tag">{p.country_type === "OVERSEAS" ? "Overseas" : "Local"}</span>
                            <div className="muted">{formatMoney(p.base_price)}</div>
                          </div>
                          <div className="btn-row">
                            <button className="btn btn-sm" onClick={() => setPlayerFromRoster(p.id)}>On block</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => removePlayer(p.id)}>Remove</button>
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
                      Tap a franchise to raise their bid. Increments auto-tier by price.
                    </p>
                    <div className="bid-board">
                      <div>
                        <div className="muted">On the block</div>
                        <h3 className="block-player">{live?.currentPlayer?.name || "Waiting…"}</h3>
                        {live?.currentPlayer && (
                          <div className="muted">
                            {ROLE_LABELS[live.currentPlayer.role] || live.currentPlayer.role}
                            {" · "}
                            {CATEGORY_LABELS[live.currentPlayer.category] || live.currentPlayer.category}
                            {" · "}
                            {live.currentPlayer.countryType === "OVERSEAS" ? "Overseas" : "Local"}
                            {" · base "}
                            {formatMoney(live.currentPlayer.basePrice)}
                          </div>
                        )}
                        <div className="price" key={live?.currentPrice}>{formatMoney(live?.currentPrice || 0)}</div>
                        <div className="muted">
                          Leading: <strong>{live?.leadingTeam?.name || "No bidder yet"}</strong>
                          {" · next +"}
                          {formatMoney(increment)}
                        </div>
                      </div>
                      <div>
                        <div className="btn-row" style={{ marginBottom: 14 }}>
                          <button className="btn" disabled={!live?.currentPlayer} onClick={() => placeBid("up")}>+{formatMoney(increment)}</button>
                          <button className="btn btn-ghost" disabled={!live?.currentPlayer} onClick={() => placeBid("down")}>−{formatMoney(increment)}</button>
                          <button className="btn btn-gold" disabled={!live?.currentPlayer} onClick={sellPlayer}>Sold</button>
                          <button className="btn btn-danger" disabled={!live?.currentPlayer} onClick={markUnsold}>Unsold</button>
                          <button className="btn btn-ghost" onClick={undoSale}>Undo sale</button>
                        </div>
                        <div className="team-bid-grid">
                          {(live?.teams || []).map((t) => (
                            <button
                              key={t.id}
                              className={`team-bid-btn ${String(selectedBidder) === String(t.id) ? "active" : ""}`}
                              disabled={!live?.currentPlayer}
                              onClick={() => bidForTeam(t.id)}
                              style={{ borderTop: `4px solid ${t.color || "var(--brand)"}` }}
                            >
                              <strong>{t.short_code || t.name}</strong>
                              <span>{t.name}</span>
                              <span>{formatMoney(t.remaining_budget)} left</span>
                              <span>{t.player_count || 0} ply · {t.overseas_count || 0} OS</span>
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
