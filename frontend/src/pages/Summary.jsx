import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import TopBar from "../components/TopBar";
import { formatMoney, ROLE_LABELS } from "../lib/format";

export default function Summary() {
  const [params] = useSearchParams();
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

  return (
    <div className="app-frame">
      <TopBar
        subtitle={data?.auction?.name || "Squad summary"}
        actions={
          <>
            {auctionId > 0 && (
              <>
                <a
                  className="btn"
                  href={`${apiBase}/api/auction/${auctionId}/export`}
                >
                  Download CSV
                </a>
                <Link className="btn btn-ghost" to={`/live?auctionId=${auctionId}`}>
                  Live stage
                </Link>
              </>
            )}
            <Link className="btn btn-ghost" to="/admin">
              Admin
            </Link>
          </>
        }
      />

      <div className="shell">
        {!auctionId && (
          <div className="panel">
            <h2>No auction selected</h2>
            <p className="hint">
              Open summary from Admin, or add <code>?auctionId=1</code>.
            </p>
          </div>
        )}

        {loading && <p className="muted">Loading summary…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !error && auctionId > 0 && (
          <>
            <div className="team-grid">
              {(data?.teams || []).map((team) => (
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
              {(data?.unsold || []).length === 0 ? (
                <p className="hint">No unsold players.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fog)" }}>
                  {data.unsold.map((p) => (
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
    </div>
  );
}
