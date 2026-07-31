const express = require("express");
const router = express.Router();
const adminAuth = require("../middleware/adminAuth");
const svc = require("../services/auctionService");

function getIo(req) {
  return req.app.get("io");
}

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || "Server error" });
    });
  };
}

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin123";

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ success: true, username });
});

/* =========================
   CREATE AUCTION
========================= */
router.post(
  "/",
  adminAuth,
  asyncHandler(async (req, res) => {
    const { name, teams, budget, basePrice, bidIncrement, maxSquadSize, players } =
      req.body || {};
    const base_price = Number(basePrice) || 500;
    const bid_increment = Number(bidIncrement) || 100;
    const budget_per_team = Number(budget);
    const max_squad = Number(maxSquadSize) || 0;

    if (!name || !teams || !Array.isArray(teams) || teams.length === 0 || !budget_per_team) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name, teams, budget" });
    }

    const cleanTeams = teams.map((t) => String(t).trim()).filter(Boolean);
    if (!cleanTeams.length) {
      return res.status(400).json({ error: "At least one team is required" });
    }

    const result = await svc.run(
      `INSERT INTO auctions (name, base_price, bid_increment, max_squad_size, status)
       VALUES (?, ?, ?, ?, 'CREATED')`,
      [name.trim(), base_price, bid_increment, max_squad]
    );
    const auctionId = result.lastID;

    for (const teamName of cleanTeams) {
      await svc.run(
        `INSERT INTO teams (auction_id, name, total_budget, remaining_budget, player_count)
         VALUES (?, ?, ?, ?, 0)`,
        [auctionId, teamName, budget_per_team, budget_per_team]
      );
    }

    await svc.ensureState(auctionId);

    if (Array.isArray(players) && players.length) {
      let order = 1;
      for (const p of players) {
        const pname = String(p.name || p).trim();
        if (!pname) continue;
        await svc.run(
          `INSERT INTO players (auction_id, name, role, base_price, status, sort_order)
           VALUES (?, ?, ?, ?, 'AVAILABLE', ?)`,
          [
            auctionId,
            pname,
            svc.normalizeRole(p.role),
            Number(p.basePrice) || base_price,
            order++,
          ]
        );
      }
    }

    res.json({ auctionId, message: "Auction created successfully" });
  })
);

/* =========================
   LIST / DELETE AUCTIONS
========================= */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await svc.all(
      `SELECT id, name, base_price, bid_increment, max_squad_size, status, created_at
       FROM auctions ORDER BY id DESC`
    );
    res.json(rows);
  })
);

router.delete(
  "/:auctionId",
  adminAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.auctionId;
    await svc.run(`DELETE FROM players WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM teams WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM auction_state WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM auctions WHERE id=?`, [id]);
    res.json({ success: true });
  })
);

/* =========================
   START / END
========================= */
router.post(
  "/:auctionId/start",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const auction = await svc.getAuction(auctionId);
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    await svc.run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
    await svc.ensureState(auctionId);
    await svc.run(`UPDATE auction_state SET is_live=1 WHERE auction_id=?`, [auctionId]);

    const live = await svc.buildLivePayload(auctionId);
    const io = getIo(req);
    if (io) {
      io.emit("auction:update", { auctionId, status: "LIVE" });
      io.emit("auction:live", live);
    }
    res.json(live);
  })
);

router.post(
  "/:auctionId/end",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    await svc.run(`UPDATE auctions SET status='COMPLETED' WHERE id=?`, [auctionId]);
    await svc.run(`UPDATE auction_state SET is_live=0 WHERE auction_id=?`, [auctionId]);
    const live = await svc.buildLivePayload(auctionId);
    const io = getIo(req);
    if (io) {
      io.emit("auction:update", { auctionId, status: "COMPLETED" });
      io.emit("auction:live", live);
    }
    res.json(live);
  })
);

/* =========================
   PLAYERS ROSTER
========================= */
router.get(
  "/:auctionId/players",
  asyncHandler(async (req, res) => {
    const players = await svc.listPlayers(req.params.auctionId, req.query.status);
    res.json(players);
  })
);

router.post(
  "/:auctionId/players",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const auction = await svc.getAuction(auctionId);
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    const { name, role, basePrice, players } = req.body || {};
    const created = [];

    const rows = Array.isArray(players)
      ? players
      : name
        ? [{ name, role, basePrice }]
        : [];

    if (!rows.length) {
      return res.status(400).json({ error: "Provide a player name or players array" });
    }

    const maxOrder = await svc.get(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM players WHERE auction_id=?`,
      [auctionId]
    );
    let order = (maxOrder?.m || 0) + 1;

    for (const p of rows) {
      const pname = String(p.name || "").trim();
      if (!pname) continue;
      const result = await svc.run(
        `INSERT INTO players (auction_id, name, role, base_price, status, sort_order)
         VALUES (?, ?, ?, ?, 'AVAILABLE', ?)`,
        [
          auctionId,
          pname,
          svc.normalizeRole(p.role),
          Number(p.basePrice) || auction.base_price || 500,
          order++,
        ]
      );
      created.push(result.lastID);
    }

    res.json({ success: true, createdCount: created.length, ids: created });
  })
);

router.delete(
  "/:auctionId/players/:playerId",
  adminAuth,
  asyncHandler(async (req, res) => {
    const player = await svc.get(
      `SELECT * FROM players WHERE id=? AND auction_id=?`,
      [req.params.playerId, req.params.auctionId]
    );
    if (!player) return res.status(404).json({ error: "Player not found" });
    if (player.status === "SOLD") {
      return res.status(400).json({ error: "Cannot delete a sold player" });
    }
    if (player.status === "BIDDING") {
      return res.status(400).json({ error: "Cannot delete player currently on the block" });
    }
    await svc.run(`DELETE FROM players WHERE id=?`, [req.params.playerId]);
    res.json({ success: true });
  })
);

/* =========================
   SET PLAYER / BID / SELL
========================= */
router.post(
  "/:auctionId/set-player",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const { playerId, playerName, basePrice } = req.body || {};
    const live = await svc.setPlayerOnBlock(auctionId, playerId, playerName, basePrice);
    const io = getIo(req);
    if (io) {
      io.emit("player:update", live);
      io.emit("auction:live", live);
    }
    res.json(live);
  })
);

router.post(
  "/:auctionId/bid",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const live = await svc.placeBid(auctionId, req.body || {});
    const io = getIo(req);
    if (io) {
      io.emit("player:update", live);
      io.emit("auction:live", live);
    }
    res.json(live);
  })
);

router.post(
  "/:auctionId/sell",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const result = await svc.sellCurrentPlayer(auctionId, req.body?.teamId);
    const io = getIo(req);
    if (io) {
      io.emit("player:sold", result);
      io.emit("auction:live", result);
    }
    res.json(result);
  })
);

router.post(
  "/:auctionId/unsold",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const result = await svc.unsoldCurrentPlayer(auctionId);
    const io = getIo(req);
    if (io) {
      io.emit("player:unsold", result);
      io.emit("auction:live", result);
    }
    res.json(result);
  })
);

/* =========================
   PUBLIC READS
========================= */
router.get(
  "/:auctionId/state",
  asyncHandler(async (req, res) => {
    const live = await svc.buildLivePayload(Number(req.params.auctionId));
    if (!live) return res.status(404).json({ error: "Auction not found" });
    res.json(live);
  })
);

router.get(
  "/:auctionId/teams",
  asyncHandler(async (req, res) => {
    res.json(await svc.listTeams(req.params.auctionId));
  })
);

router.get(
  "/:auctionId/summary",
  asyncHandler(async (req, res) => {
    const auctionId = req.params.auctionId;
    const auction = await svc.getAuction(auctionId);
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    const rows = await svc.all(
      `
      SELECT
        t.id AS teamId,
        t.name AS teamName,
        t.total_budget,
        t.remaining_budget,
        t.player_count,
        p.id AS playerId,
        p.name AS playerName,
        p.role AS playerRole,
        p.sold_price,
        p.status AS playerStatus
      FROM teams t
      LEFT JOIN players p ON p.team_id = t.id AND p.status = 'SOLD'
      WHERE t.auction_id = ?
      ORDER BY t.id, p.id
      `,
      [auctionId]
    );

    const summary = {};
    for (const row of rows) {
      if (!summary[row.teamId]) {
        summary[row.teamId] = {
          teamId: row.teamId,
          teamName: row.teamName,
          totalBudget: row.total_budget,
          remainingBudget: row.remaining_budget,
          playerCount: row.player_count,
          players: [],
          totalSpent: 0,
        };
      }
      if (row.playerName) {
        summary[row.teamId].players.push({
          id: row.playerId,
          name: row.playerName,
          role: row.playerRole,
          price: row.sold_price,
        });
        summary[row.teamId].totalSpent += row.sold_price || 0;
      }
    }

    const unsold = await svc.all(
      `SELECT id, name, role, base_price FROM players
       WHERE auction_id=? AND status='UNSOLD' ORDER BY id`,
      [auctionId]
    );

    res.json({
      auction: {
        id: auction.id,
        name: auction.name,
        status: auction.status,
      },
      teams: Object.values(summary),
      unsold,
    });
  })
);

router.get(
  "/:auctionId/export",
  asyncHandler(async (req, res) => {
    const auctionId = req.params.auctionId;
    const rows = await svc.all(
      `
      SELECT
        t.name AS teamName,
        p.name AS playerName,
        p.role,
        p.base_price AS basePrice,
        p.sold_price AS soldPrice,
        p.status
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.auction_id = ?
      ORDER BY p.status DESC, t.name, p.name
      `,
      [auctionId]
    );

    let csv = "Team,Player,Role,Base Price,Sold Price,Status\n";
    for (const row of rows) {
      const team = row.teamName || "";
      csv += `"${team}","${row.playerName}","${row.role || ""}",${row.basePrice || 0},${row.soldPrice || 0},${row.status}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=auction_${auctionId}_players.csv`
    );
    res.send(csv);
  })
);

module.exports = router;
