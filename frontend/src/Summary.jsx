import { useEffect, useState } from "react";
import api from "./services/api";

const ROLE_LABELS = {
  BAT: "Batsman",
  BOWL: "Bowler",
  AR: "All-rounder",
  WK: "Wicket-keeper",
};

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function Summary() {
  const params = new URLSearchParams(window.location.search);
  const auctionId = Number(params.get("auctionId"));

  const [data, setData] = useState(null);
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
        if (active) setData(res.data);
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
        <p className="muted">Add ?auctionId=… to view the summary.</p>
      </div>
    );
  }

  const teams = data?.teams || [];
  const unsold = data?.unsold || [];

  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <div className="brand-mark">KPL Auction</div>
          <div className="brand-sub">
            {data?.auction?.name || "Team summary"}
            {data?.auction?.status ? ` · ${data.auction.status}` : ""}
          </div>
        </div>
        <div className="nav-links">
          <a className="btn" href={`${apiBase}/api/auction/${auctionId}/export`}>
            Download CSV
          </a>
          <a className="btn btn-ghost" href={`/public?auctionId=${auctionId}`}>
            Live screen
          </a>
          <a className="btn btn-ghost" href="/">
            Admin
          </a>
        </div>
      </div>

      {loading && <p className="muted">Loading summary…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          <div className="team-grid">
            {teams.map((team) => (
              <article className="team-card" key={team.teamId}>
                <h3>{team.teamName}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Spent {formatMoney(team.totalSpent)} · Remaining{" "}
                  {formatMoney(team.remainingBudget)} · {team.players.length}{" "}
                  players
                </p>
                <h4 style={{ marginBottom: 0 }}>Squad</h4>
                {team.players.length === 0 ? (
                  <p className="muted">No players bought</p>
                ) : (
                  <ul>
                    {team.players.map((p) => (
                      <li key={p.id || p.name}>
                        {p.name}
                        <span className="muted">
                          {" "}
                          · {ROLE_LABELS[p.role] || p.role || "—"} ·{" "}
                          {formatMoney(p.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          <section className="panel" style={{ marginTop: 18 }}>
            <h2>Unsold players</h2>
            {unsold.length === 0 ? (
              <p className="hint">No unsold players.</p>
            ) : (
              <ul className="unsold-list">
                {unsold.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    <span className="muted">
                      {" "}
                      · {ROLE_LABELS[p.role] || p.role} · base{" "}
                      {formatMoney(p.base_price)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default Summary;
