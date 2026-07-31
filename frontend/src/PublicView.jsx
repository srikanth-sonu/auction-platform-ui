import { useEffect, useState } from "react";
import { getSocket } from "./services/socket";
import api from "./services/api";

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function PublicView() {
  const params = new URLSearchParams(window.location.search);
  const auctionId = Number(params.get("auctionId"));

  const [auctionName, setAuctionName] = useState("KPL Auction");
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [currentPrice, setCurrentPrice] = useState(0);
  const [lastSold, setLastSold] = useState(null);
  const [lastUnsold, setLastUnsold] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!auctionId) return;

    const socket = getSocket();
    socket.emit("auction:join", { auctionId });

    api.get(`/api/auction/${auctionId}/state`).then((res) => {
      setAuctionName(res.data.name || "KPL Auction");
      setStatus(res.data.status || "");
      if (res.data.currentPlayer) setCurrentPlayer(res.data.currentPlayer);
      if (res.data.currentPrice) setCurrentPrice(res.data.currentPrice);
    });

    const onPlayerUpdate = (data) => {
      if (data.auctionId && Number(data.auctionId) !== auctionId) return;
      setLastSold(null);
      setLastUnsold(null);
      if (data.playerName) setCurrentPlayer(data.playerName);
      if (data.currentPrice !== undefined) setCurrentPrice(data.currentPrice);
    };

    const onPlayerSold = (data) => {
      if (data.auctionId && Number(data.auctionId) !== auctionId) return;
      setLastSold({
        name: data.playerName,
        price: data.soldPrice,
        team: data.teamName,
      });
      setLastUnsold(null);
      setCurrentPlayer("");
      setCurrentPrice(0);
    };

    const onPlayerUnsold = (data) => {
      if (data.auctionId && Number(data.auctionId) !== auctionId) return;
      setLastUnsold({ name: data.playerName });
      setLastSold(null);
      setCurrentPlayer("");
      setCurrentPrice(0);
    };

    const onAuctionUpdate = (data) => {
      if (data.auctionId && Number(data.auctionId) !== auctionId) return;
      if (data.status) setStatus(data.status);
    };

    socket.on("player:update", onPlayerUpdate);
    socket.on("player:sold", onPlayerSold);
    socket.on("player:unsold", onPlayerUnsold);
    socket.on("auction:update", onAuctionUpdate);

    return () => {
      socket.off("player:update", onPlayerUpdate);
      socket.off("player:sold", onPlayerSold);
      socket.off("player:unsold", onPlayerUnsold);
      socket.off("auction:update", onAuctionUpdate);
    };
  }, [auctionId]);

  if (!auctionId) {
    return (
      <div className="live-stage">
        <div className="live-card">
          <div className="brand-mark">KPL Auction</div>
          <p className="live-meta">Invalid auction link. Add ?auctionId=…</p>
        </div>
      </div>
    );
  }

  const showSold = !currentPlayer && lastSold;
  const showUnsold = !currentPlayer && !lastSold && lastUnsold;

  return (
    <div className="live-stage">
      <div
        className={`live-card ${showSold ? "sold-flash" : ""}`}
        key={currentPlayer || lastSold?.name || lastUnsold?.name || "idle"}
      >
        <div className="brand-mark" style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)" }}>
          {auctionName}
        </div>
        <div className="live-meta" style={{ marginTop: 4, marginBottom: 24 }}>
          Live auction{status ? ` · ${status}` : ""}
        </div>

        {currentPlayer && (
          <>
            <div className="live-kicker">Now bidding</div>
            <h1 className="live-player">{currentPlayer}</h1>
            <div className="price" key={currentPrice}>
              {formatMoney(currentPrice)}
            </div>
          </>
        )}

        {showSold && (
          <>
            <div className="live-kicker">Sold</div>
            <h1 className="live-player">{lastSold.name}</h1>
            <div className="price">{formatMoney(lastSold.price)}</div>
            {lastSold.team && (
              <p className="live-meta">to {lastSold.team}</p>
            )}
          </>
        )}

        {showUnsold && (
          <>
            <div className="live-kicker">Unsold</div>
            <h1 className="live-player">{lastUnsold.name}</h1>
            <p className="live-meta">No bids cleared the floor</p>
          </>
        )}

        {!currentPlayer && !lastSold && !lastUnsold && (
          <>
            <div className="live-kicker">Stand by</div>
            <h1 className="live-player">Waiting for next player</h1>
          </>
        )}
      </div>
    </div>
  );
}

export default PublicView;
