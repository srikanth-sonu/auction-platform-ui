import { useEffect, useState } from "react";
import { getSocket } from "./services/socket";
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

function PublicView() {
  const params = new URLSearchParams(window.location.search);
  const auctionId = Number(params.get("auctionId"));

  const [live, setLive] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!auctionId) return;

    const socket = getSocket();
    socket.emit("auction:join", { auctionId });

    api.get(`/api/auction/${auctionId}/state`).then((res) => setLive(res.data));

    const onLive = (data) => {
      if (data?.id && Number(data.id) !== auctionId) return;
      setLive(data);
      if (data.lastSold) {
        setFlash({
          type: "sold",
          name: data.lastSold.playerName,
          price: data.lastSold.soldPrice,
          team: data.lastSold.teamName,
        });
      } else if (data.lastUnsold) {
        setFlash({
          type: "unsold",
          name: data.lastUnsold.playerName,
        });
      } else if (data.currentPlayer) {
        setFlash(null);
      }
    };

    socket.on("auction:live", onLive);
    socket.on("player:update", onLive);
    socket.on("player:sold", onLive);
    socket.on("player:unsold", onLive);

    return () => {
      socket.off("auction:live", onLive);
      socket.off("player:update", onLive);
      socket.off("player:sold", onLive);
      socket.off("player:unsold", onLive);
    };
  }, [auctionId]);

  if (!auctionId) {
    return (
      <div className="live-stage">
        <div className="live-card">
          <div className="brand-mark">KPL Auction</div>
          <p className="live-meta">Open with ?auctionId=…</p>
        </div>
      </div>
    );
  }

  const current = live?.currentPlayer;
  const showSold = !current && flash?.type === "sold";
  const showUnsold = !current && flash?.type === "unsold";

  return (
    <div className="live-stage live-stage-wide">
      <div className="live-layout">
        <div
          className={`live-card ${showSold ? "sold-flash" : ""}`}
          key={
            current?.name ||
            flash?.name ||
            "idle"
          }
        >
          <div
            className="brand-mark"
            style={{ fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)" }}
          >
            {live?.name || "KPL Auction"}
          </div>
          <div className="live-meta" style={{ marginBottom: 20 }}>
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
                Leading bid:{" "}
                <strong>{live.leadingTeam?.name || "—"}</strong>
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
          <div className="purse-list">
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
            {!live?.teams?.length && (
              <p className="muted">Teams will appear when the auction loads.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default PublicView;
