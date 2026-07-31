import { useEffect, useState } from "react";
import api from "./services/api";

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function Summary() {
  const params = new URLSearchParams(window.location.search);
  const auctionId = Number(params.get("auctionId"));

  const [summary, setSummary] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(auctionId));

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

  useEffect(() => {
    if (!auctionId) return;

    let active = true;
    api
      .get(`/api/auction/${auctionId}/summary`)
      .then((res) => {
        if (active) setSummary(res.data || []);
      })
      .catch(() => {
        if (active) setError("Failed to load summary");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [auctionId]);

  if (!auctionId) {
    return (
      <div className="app-shell">
        <div className="brand-mark">KPL Auction</div>
        <p className="muted">Invalid auction. Add ?auctionId=…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <div className="brand-mark">KPL Auction</div>
          <div className="brand-sub">Team summary</div>
        </div>
        <div className="nav-links">
          <a
            className="btn"
            href={`${apiBase}/api/auction/${auctionId}/export`}
          >
            Download CSV
          </a>
          <a
            className="btn btn-ghost"
            href={`/public?auctionId=${auctionId}`}
          >
            Live screen
          </a>
        </div>
      </div>

      {loading && <p className="muted">Loading summary…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && summary.length === 0 && (
        <div className="panel">
          <h2>No teams yet</h2>
          <p className="hint">Create an auction and sell players to see results here.</p>
        </div>
      )}

      <div className="team-grid">
        {summary.map((team) => (
          <article className="team-card" key={team.teamId || team.teamName}>
            <h3>{team.teamName}</h3>
            <p className="muted" style={{ margin: 0 }}>
              Spent {formatMoney(team.totalSpent)} · Remaining{" "}
              {formatMoney(team.remainingBudget)}
            </p>
            <h4 style={{ marginBottom: 0 }}>Players</h4>
            {team.players.length === 0 ? (
              <p className="muted">No players bought</p>
            ) : (
              <ul>
                {team.players.map((p, index) => (
                  <li key={`${p.name}-${index}`}>
                    {p.name} – {formatMoney(p.price)}
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export default Summary;
