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

function emitLive(req, data, events = ["auction:live"]) {
  const io = getIo(req);
  if (!io || !data) return;
  for (const event of events) io.emit(event, data);
}

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

router.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "kpl-auction-api" });
});

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

/* Clubs */
router.get(
  "/clubs",
  asyncHandler(async (_req, res) => {
    const clubs = await svc.all(
      `SELECT c.*,
         (SELECT COUNT(*) FROM auctions a WHERE a.club_id = c.id) AS auction_count
       FROM clubs c ORDER BY c.id DESC`
    );
    res.json(clubs);
  })
);

router.post(
  "/clubs",
  adminAuth,
  asyncHandler(async (req, res) => {
    const { name, pin, primaryColor } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Club name is required" });
    }
    let slug = slugify(name);
    const existing = await svc.get(`SELECT id FROM clubs WHERE slug=?`, [slug]);
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const result = await svc.run(
      `INSERT INTO clubs (name, slug, pin, primary_color) VALUES (?, ?, ?, ?)`,
      [name.trim(), slug, String(pin || "1234"), primaryColor || "#0B6E4F"]
    );
    res.json({ clubId: result.lastID, slug, name: name.trim() });
  })
);

/* Create auction */
router.post(
  "/",
  adminAuth,
  asyncHandler(async (req, res) => {
    const {
      name,
      clubId,
      clubName,
      teams,
      budget,
      basePrice,
      bidIncrement,
      maxSquadSize,
      maxOverseas,
      timerSeconds,
      players,
    } = req.body || {};

    const base_price = Number(basePrice) || 500;
    const bid_increment = Number(bidIncrement) || 100;
    const budget_per_team = Number(budget);
    const max_squad = Number(maxSquadSize) || 11;
    const max_overseas = Number(maxOverseas) ?? 4;
    const timer_seconds = Number(timerSeconds) || 0;

    if (!name || !teams || !Array.isArray(teams) || teams.length === 0 || !budget_per_team) {
      return res.status(400).json({
        error: "Missing required fields: name, teams (array), budget",
      });
    }

    let resolvedClubId = clubId ? Number(clubId) : null;
    if (!resolvedClubId && clubName) {
      const slug = slugify(clubName);
      let club = await svc.get(`SELECT id FROM clubs WHERE slug=?`, [slug]);
      if (!club) {
        const created = await svc.run(
          `INSERT INTO clubs (name, slug, pin, primary_color) VALUES (?, ?, '1234', '#0B6E4F')`,
          [clubName.trim(), slug]
        );
        resolvedClubId = created.lastID;
      } else {
        resolvedClubId = club.id;
      }
    }

    const result = await svc.run(
      `INSERT INTO auctions
         (club_id, name, base_price, bid_increment, max_squad_size, max_overseas, timer_seconds, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED')`,
      [
        resolvedClubId,
        name.trim(),
        base_price,
        bid_increment,
        max_squad,
        max_overseas,
        timer_seconds,
      ]
    );
    const auctionId = result.lastID;

    for (const team of teams) {
      const teamName = typeof team === "string" ? team : team.name;
      if (!teamName || !String(teamName).trim()) continue;
      const short =
        (typeof team === "object" && team.shortCode) ||
        String(teamName)
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 4)
          .toUpperCase();
      const color =
        (typeof team === "object" && team.color) || "#0B6E4F";
      await svc.run(
        `INSERT INTO teams
           (auction_id, name, short_code, color, total_budget, remaining_budget, player_count, overseas_count)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
        [auctionId, String(teamName).trim(), short, color, budget_per_team, budget_per_team]
      );
    }

    await svc.ensureState(auctionId);

    if (Array.isArray(players) && players.length) {
      let order = 1;
      for (const p of players) {
        const pname = String(p.name || p).trim();
        if (!pname) continue;
        await svc.run(
          `INSERT INTO players
             (auction_id, name, role, category, country_type, base_price, status, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)`,
          [
            auctionId,
            pname,
            svc.normalizeRole(p.role),
            svc.normalizeCategory(p.category),
            svc.normalizeCountry(p.countryType || p.country_type),
            Number(p.basePrice) || base_price,
            order++,
          ]
        );
      }
    }

    res.json({ auctionId, clubId: resolvedClubId, message: "Auction created successfully" });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const clubId = req.query.clubId;
    const rows = clubId
      ? await svc.all(
          `SELECT a.*, c.name AS club_name
           FROM auctions a LEFT JOIN clubs c ON c.id = a.club_id
           WHERE a.club_id=? ORDER BY a.id DESC`,
          [clubId]
        )
      : await svc.all(
          `SELECT a.*, c.name AS club_name
           FROM auctions a LEFT JOIN clubs c ON c.id = a.club_id
           ORDER BY a.id DESC`
        );
    res.json(rows);
  })
);

router.delete(
  "/:auctionId",
  adminAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.auctionId;
    await svc.run(`DELETE FROM auction_events WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM players WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM teams WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM auction_state WHERE auction_id=?`, [id]);
    await svc.run(`DELETE FROM auctions WHERE id=?`, [id]);
    res.json({ success: true });
  })
);

router.post(
  "/:auctionId/start",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    if (!(await svc.getAuction(auctionId))) {
      return res.status(404).json({ error: "Auction not found" });
    }
    await svc.run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
    await svc.ensureState(auctionId);
    await svc.run(`UPDATE auction_state SET is_live=1 WHERE auction_id=?`, [auctionId]);
    const live = await svc.buildLivePayload(auctionId);
    emitLive(req, live, ["auction:live", "auction:update"]);
    res.json(live);
  })
);

router.post(
  "/:auctionId/end",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    await svc.run(`UPDATE auctions SET status='COMPLETED' WHERE id=?`, [auctionId]);
    await svc.run(
      `UPDATE auction_state SET is_live=0, timer_ends_at=NULL WHERE auction_id=?`,
      [auctionId]
    );
    const live = await svc.buildLivePayload(auctionId);
    emitLive(req, live, ["auction:live", "auction:update"]);
    res.json(live);
  })
);

router.get(
  "/:auctionId/players",
  asyncHandler(async (req, res) => {
    res.json(await svc.listPlayers(req.params.auctionId, req.query.status));
  })
);

router.post(
  "/:auctionId/players",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const auction = await svc.getAuction(auctionId);
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    const { name, role, category, countryType, basePrice, players } = req.body || {};
    const rows = Array.isArray(players)
      ? players
      : name
        ? [{ name, role, category, countryType, basePrice }]
        : [];

    if (!rows.length) {
      return res.status(400).json({ error: "Provide a player name or players array" });
    }

    const maxOrder = await svc.get(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM players WHERE auction_id=?`,
      [auctionId]
    );
    let order = (maxOrder?.m || 0) + 1;
    const ids = [];

    for (const p of rows) {
      const pname = String(p.name || "").trim();
      if (!pname) continue;
      const result = await svc.run(
        `INSERT INTO players
           (auction_id, name, role, category, country_type, base_price, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)`,
        [
          auctionId,
          pname,
          svc.normalizeRole(p.role),
          svc.normalizeCategory(p.category),
          svc.normalizeCountry(p.countryType || p.country_type),
          Number(p.basePrice) || auction.base_price || 500,
          order++,
        ]
      );
      ids.push(result.lastID);
    }

    res.json({ success: true, createdCount: ids.length, ids });
  })
);

router.post(
  "/:auctionId/players/import",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const auction = await svc.getAuction(auctionId);
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    const csv = String(req.body?.csv || "");
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: "CSV is empty" });

    const start = lines[0].toLowerCase().includes("name") ? 1 : 0;
    const players = [];
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (!parts[0]) continue;
      players.push({
        name: parts[0],
        role: parts[1] || "BAT",
        category: parts[2] || "UNCAPPED",
        countryType: parts[3] || "LOCAL",
        basePrice: Number(parts[4]) || auction.base_price,
      });
    }

    req.body.players = players;
    // reuse create logic
    const maxOrder = await svc.get(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM players WHERE auction_id=?`,
      [auctionId]
    );
    let order = (maxOrder?.m || 0) + 1;
    let count = 0;
    for (const p of players) {
      await svc.run(
        `INSERT INTO players
           (auction_id, name, role, category, country_type, base_price, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', ?)`,
        [
          auctionId,
          p.name,
          svc.normalizeRole(p.role),
          svc.normalizeCategory(p.category),
          svc.normalizeCountry(p.countryType),
          p.basePrice,
          order++,
        ]
      );
      count++;
    }
    res.json({ success: true, createdCount: count });
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
    if (player.status === "SOLD" || player.status === "BIDDING") {
      return res.status(400).json({ error: "Cannot delete player in current state" });
    }
    await svc.run(`DELETE FROM players WHERE id=?`, [req.params.playerId]);
    res.json({ success: true });
  })
);

router.post(
  "/:auctionId/set-player",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const { playerId, playerName, basePrice } = req.body || {};
    const live = await svc.setPlayerOnBlock(auctionId, playerId, playerName, basePrice);
    emitLive(req, live, ["player:update", "auction:live"]);
    res.json(live);
  })
);

router.post(
  "/:auctionId/next-player",
  adminAuth,
  asyncHandler(async (req, res) => {
    const auctionId = Number(req.params.auctionId);
    const live = await svc.nextAvailablePlayer(auctionId, {
      random: Boolean(req.body?.random),
    });
    emitLive(req, live, ["player:update", "auction:live"]);
    res.json(live);
  })
);

router.post(
  "/:auctionId/bid",
  adminAuth,
  asyncHandler(async (req, res) => {
    const live = await svc.placeBid(Number(req.params.auctionId), req.body || {});
    emitLive(req, live, ["player:update", "auction:live"]);
    res.json(live);
  })
);

router.post(
  "/:auctionId/sell",
  adminAuth,
  asyncHandler(async (req, res) => {
    const result = await svc.sellCurrentPlayer(
      Number(req.params.auctionId),
      req.body?.teamId
    );
    emitLive(req, result, ["player:sold", "auction:live"]);
    res.json(result);
  })
);

router.post(
  "/:auctionId/unsold",
  adminAuth,
  asyncHandler(async (req, res) => {
    const result = await svc.unsoldCurrentPlayer(Number(req.params.auctionId));
    emitLive(req, result, ["player:unsold", "auction:live"]);
    res.json(result);
  })
);

router.post(
  "/:auctionId/undo-sale",
  adminAuth,
  asyncHandler(async (req, res) => {
    const live = await svc.undoLastSale(Number(req.params.auctionId));
    emitLive(req, live, ["auction:live"]);
    res.json(live);
  })
);

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
        t.short_code,
        t.color,
        t.total_budget,
        t.remaining_budget,
        t.player_count,
        t.overseas_count,
        p.id AS playerId,
        p.name AS playerName,
        p.role AS playerRole,
        p.category AS playerCategory,
        p.country_type AS playerCountry,
        p.sold_price
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
          shortCode: row.short_code,
          color: row.color,
          totalBudget: row.total_budget,
          remainingBudget: row.remaining_budget,
          playerCount: row.player_count,
          overseasCount: row.overseas_count,
          players: [],
          totalSpent: 0,
        };
      }
      if (row.playerName) {
        summary[row.teamId].players.push({
          id: row.playerId,
          name: row.playerName,
          role: row.playerRole,
          category: row.playerCategory,
          countryType: row.playerCountry,
          price: row.sold_price,
        });
        summary[row.teamId].totalSpent += row.sold_price || 0;
      }
    }

    const unsold = await svc.all(
      `SELECT id, name, role, category, country_type, base_price
       FROM players WHERE auction_id=? AND status='UNSOLD' ORDER BY id`,
      [auctionId]
    );

    res.json({
      auction: {
        id: auction.id,
        name: auction.name,
        status: auction.status,
        clubName: auction.club_name,
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
        p.category,
        p.country_type AS countryType,
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

    let csv =
      "Team,Player,Role,Category,Country Type,Base Price,Sold Price,Status\n";
    for (const row of rows) {
      csv += `"${row.teamName || ""}","${row.playerName}","${row.role || ""}","${row.category || ""}","${row.countryType || ""}",${row.basePrice || 0},${row.soldPrice || 0},${row.status}\n`;
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
