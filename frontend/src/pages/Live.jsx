import { Link, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import ViewModeToggle from "../components/ViewModeToggle";
import useAuctionLive from "../hooks/useAuctionLive";
import { formatMoney, ROLE_LABELS } from "../lib/format";

const AuctionScene3D = lazy(() => import("../scene/AuctionScene3D"));

function Live2D({ live, flash }) {
  const current = live?.currentPlayer;
  const showSold = !current && flash?.type === "sold";
  const showUnsold = !current && flash?.type === "unsold";

  return (
    <div className="live-stage-2d">
      <div
        className={`live-card ${showSold ? "sold-flash" : ""}`}
        key={current?.name || flash?.name || "idle"}
      >
        <div className="brand-mark" style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>
          {live?.name || "KPL Auction"}
        </div>
        <div className="live-meta" style={{ marginBottom: 18 }}>
          {live?.status || "…"}
          {live?.counts
            ? ` · ${live.counts.sold} sold · ${live.counts.available} left`
            : ""}
        </div>

        {current && (
          <>
            <div className="live-kicker">Now bidding</div>
            <h1 className="live-player">{current.name}</h1>
            <div className="live-meta">
              {ROLE_LABELS[current.role] || current.role}
            </div>
            <div className="price" key={live.currentPrice}>
              {formatMoney(live.currentPrice)}
            </div>
            <p className="live-meta">
              Leading bid: <strong>{live.leadingTeam?.name || "—"}</strong>
            </p>
          </>
        )}

        {showSold && (
          <>
            <div className="live-kicker">Sold</div>
            <h1 className="live-player">{flash.name}</h1>
            <div className="price">{formatMoney(flash.price)}</div>
            <p className="live-meta">to {flash.team}</p>
          </>
        )}

        {showUnsold && (
          <>
            <div className="live-kicker">Unsold</div>
            <h1 className="live-player">{flash.name}</h1>
            <p className="live-meta">Goes back unsold</p>
          </>
        )}

        {!current && !flash && (
          <>
            <div className="live-kicker">Stand by</div>
            <h1 className="live-player">Waiting for next player</h1>
          </>
        )}
      </div>

      <aside className="purse-rail">
        <h3>Team purses</h3>
        {(live?.teams || []).map((t) => (
          <div
            key={t.id}
            className={`purse-item ${live?.leadingTeam?.id === t.id ? "leading" : ""}`}
          >
            <strong>{t.name}</strong>
            <span>{formatMoney(t.remaining_budget)}</span>
            <span className="muted">{t.player_count || 0} players</span>
          </div>
        ))}
        {!live?.teams?.length && (
          <p className="muted">Teams appear when the auction loads.</p>
        )}
      </aside>
    </div>
  );
}

function Live3D({ live, flash }) {
  return (
    <div className="live-stage-3d">
      <Suspense fallback={<div className="shell muted">Loading 3D stage…</div>}>
        <AuctionScene3D live={live} flash={flash} />
      </Suspense>
      <div className="overlay-3d">
        <div className="hud-left">
          <div className="hud-panel">
            <div className="brand-mark" style={{ fontSize: "1.6rem" }}>
              {live?.name || "KPL Auction"}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {live?.status || "…"}
              {live?.counts ? ` · ${live.counts.sold}/${live.counts.total}` : ""}
            </div>
          </div>
        </div>
        <div className="hud-right">
          <div className="purse-rail" style={{ boxShadow: "none" }}>
            <h3>Purses</h3>
            {(live?.teams || []).map((t) => (
              <div
                key={t.id}
                className={`purse-item ${
                  live?.leadingTeam?.id === t.id ? "leading" : ""
                }`}
              >
                <strong>{t.name}</strong>
                <span>{formatMoney(t.remaining_budget)}</span>
                <span className="muted">{t.player_count || 0} players</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Live() {
  const [params, setParams] = useSearchParams();
  const auctionId = Number(params.get("auctionId"));
  const [mode, setMode] = useState(
    () => params.get("mode") || localStorage.getItem("live_view_mode") || "3d"
  );
  const { live, flash, error } = useAuctionLive(auctionId || "");

  useEffect(() => {
    localStorage.setItem("live_view_mode", mode);
    const next = new URLSearchParams(params);
    next.set("mode", mode);
    if (auctionId) next.set("auctionId", String(auctionId));
    setParams(next, { replace: true });
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auctionId) {
    return (
      <div className="live-shell">
        <div className="live-toolbar">
          <div className="brand-mark" style={{ fontSize: "1.8rem" }}>
            KPL Auction
          </div>
          <Link className="btn btn-ghost" to="/admin">
            Admin
          </Link>
        </div>
        <div className="shell">
          <div className="panel">
            <h2>Choose an auction</h2>
            <p className="hint">
              Open from Admin → Live stage, or add <code>?auctionId=1</code> to
              the URL.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-shell">
      <div className="live-toolbar">
        <div>
          <div className="brand-mark" style={{ fontSize: "1.7rem" }}>
            KPL Auction
          </div>
          <div className="brand-sub">Live stage · {mode.toUpperCase()}</div>
        </div>
        <div className="btn-row">
          <ViewModeToggle mode={mode} onChange={setMode} />
          <Link className="btn btn-ghost" to={`/summary?auctionId=${auctionId}`}>
            Summary
          </Link>
          <Link className="btn btn-ghost" to="/admin">
            Admin
          </Link>
        </div>
      </div>

      {error && (
        <div className="toast" style={{ margin: 12 }}>
          <p className="error-text">{error}</p>
        </div>
      )}

      {mode === "3d" ? (
        <Live3D live={live} flash={flash} />
      ) : (
        <Live2D live={live} flash={flash} />
      )}
    </div>
  );
}
