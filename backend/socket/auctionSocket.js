const svc = require("../services/auctionService");

async function emitLive(io, auctionId, event, extra = {}) {
  const live = await svc.buildLivePayload(auctionId);
  if (!live) return;
  io.emit(event, { ...live, ...extra });
  io.emit("auction:live", { ...live, ...extra });
}

module.exports = (io, socket) => {
  socket.on("auction:join", ({ auctionId }) => {
    if (!auctionId) return;
    socket.join(`auction:${auctionId}`);
    svc.buildLivePayload(auctionId).then((live) => {
      if (live) socket.emit("auction:live", live);
    });
  });

  socket.on("auction:start", async ({ auctionId }) => {
    try {
      if (!auctionId) return;
      await svc.run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
      await svc.ensureState(auctionId);
      await svc.run(`UPDATE auction_state SET is_live=1 WHERE auction_id=?`, [auctionId]);
      io.emit("auction:update", { auctionId, status: "LIVE" });
      await emitLive(io, auctionId, "auction:update");
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("player:set", async ({ auctionId, playerId, playerName, basePrice }) => {
    try {
      const live = await svc.setPlayerOnBlock(auctionId, playerId, playerName, basePrice);
      io.emit("player:update", live);
      io.emit("auction:live", live);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("bid:place", async ({ auctionId, amount, teamId, direction }) => {
    try {
      const live = await svc.placeBid(auctionId, { amount, teamId, direction });
      io.emit("player:update", live);
      io.emit("auction:live", live);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("bid:increase", async ({ auctionId, amount, teamId }) => {
    try {
      const live = await svc.placeBid(auctionId, {
        amount,
        teamId,
        direction: "up",
      });
      io.emit("player:update", live);
      io.emit("auction:live", live);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("bid:decrease", async ({ auctionId, amount }) => {
    try {
      const live = await svc.placeBid(auctionId, {
        amount,
        direction: "down",
      });
      io.emit("player:update", live);
      io.emit("auction:live", live);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("player:sell", async ({ auctionId, teamId }) => {
    try {
      const result = await svc.sellCurrentPlayer(auctionId, teamId);
      io.emit("player:sold", result);
      io.emit("auction:live", result);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("player:unsold", async ({ auctionId }) => {
    try {
      const result = await svc.unsoldCurrentPlayer(auctionId);
      io.emit("player:unsold", result);
      io.emit("auction:live", result);
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });
};
