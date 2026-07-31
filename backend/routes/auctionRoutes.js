const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");

function getIo(req) {
  return req.app.get("io");
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
   CREATE AUCTION (ADMIN)
========================= */
router.post("/", adminAuth, (req, res) => {
  const { name, teams, budget, basePrice } = req.body;
  const base_price = Number(basePrice) || 500;
  const budget_per_team = Number(budget);

  if (!name || !teams || !Array.isArray(teams) || teams.length === 0 || !budget_per_team) {
    return res.status(400).json({ error: "Missing required fields: name, teams, budget" });
  }

  const cleanTeams = teams.map((t) => String(t).trim()).filter(Boolean);
  if (cleanTeams.length === 0) {
    return res.status(400).json({ error: "At least one team is required" });
  }

  db.run(
    `INSERT INTO auctions (name, base_price, status) VALUES (?, ?, 'CREATED')`,
    [name.trim(), base_price],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const auctionId = this.lastID;
      const teamStmt = db.prepare(
        `INSERT INTO teams (auction_id, name, total_budget, remaining_budget)
         VALUES (?, ?, ?, ?)`
      );

      cleanTeams.forEach((teamName) => {
        teamStmt.run(auctionId, teamName, budget_per_team, budget_per_team);
      });
      teamStmt.finalize();

      db.run(
        `INSERT INTO auction_state (auction_id, current_player_name, current_price, is_live)
         VALUES (?, NULL, 0, 0)`,
        [auctionId]
      );

      res.json({ auctionId, message: "Auction created successfully" });
    }
  );
});

/* =========================
   LIST AUCTIONS
========================= */
router.get("/", (req, res) => {
  db.all(
    `SELECT id, name, base_price, status, created_at FROM auctions ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

/* =========================
   START AUCTION (ADMIN)
========================= */
router.post("/:auctionId/start", adminAuth, (req, res) => {
  const auctionId = req.params.auctionId;

  db.run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    db.run(
      `INSERT INTO auction_state (auction_id, current_player_name, current_price, is_live)
       VALUES (?, NULL, 0, 1)
       ON CONFLICT(auction_id) DO UPDATE SET is_live=1`,
      [auctionId],
      () => {
        const io = getIo(req);
        if (io) io.emit("auction:update", { auctionId: Number(auctionId), status: "LIVE" });
        res.json({ success: true });
      }
    );
  });
});

/* =========================
   SET PLAYER (ADMIN)
========================= */
router.post("/:auctionId/set-player", adminAuth, (req, res) => {
  const auctionId = req.params.auctionId;
  const { playerName, basePrice } = req.body;
  const price = Number(basePrice) || 500;

  if (!playerName || !String(playerName).trim()) {
    return res.status(400).json({ error: "Player name is required" });
  }

  db.run(
    `INSERT INTO auction_state (auction_id, current_player_name, current_price, is_live)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(auction_id) DO UPDATE SET
       current_player_name=excluded.current_player_name,
       current_price=excluded.current_price,
       is_live=1`,
    [auctionId, playerName.trim(), price],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const payload = {
        auctionId: Number(auctionId),
        playerName: playerName.trim(),
        currentPrice: price,
      };
      const io = getIo(req);
      if (io) io.emit("player:update", payload);
      res.json({ success: true, ...payload });
    }
  );
});

/* =========================
   PLACE BID (ADMIN)
========================= */
router.post("/:auctionId/bid", adminAuth, (req, res) => {
  const auctionId = req.params.auctionId;
  const { amount } = req.body;
  const newAmount = Number(amount);

  if (!Number.isFinite(newAmount) || newAmount < 0) {
    return res.status(400).json({ error: "Invalid bid amount" });
  }

  db.get(
    `SELECT current_player_name, current_price FROM auction_state WHERE auction_id=?`,
    [auctionId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row || !row.current_player_name) {
        return res.status(400).json({ error: "No player currently up for bid" });
      }

      db.run(
        `UPDATE auction_state SET current_price=? WHERE auction_id=?`,
        [newAmount, auctionId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          const payload = {
            auctionId: Number(auctionId),
            playerName: row.current_player_name,
            currentPrice: newAmount,
          };
          const io = getIo(req);
          if (io) io.emit("player:update", payload);
          res.json({ success: true, ...payload });
        }
      );
    }
  );
});

/* =========================
   SELL PLAYER (ADMIN)
========================= */
router.post("/:auctionId/sell", adminAuth, (req, res) => {
  const auctionId = req.params.auctionId;
  const { teamId, playerName, soldPrice } = req.body;
  const price = Number(soldPrice);
  const tid = Number(teamId);

  if (!tid || !playerName || !Number.isFinite(price)) {
    return res.status(400).json({ error: "teamId, playerName, and soldPrice are required" });
  }

  db.get(`SELECT remaining_budget, name FROM teams WHERE id=? AND auction_id=?`, [tid, auctionId], (err, team) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (team.remaining_budget < price) {
      return res.status(400).json({ error: "Insufficient budget" });
    }

    const newRemaining = team.remaining_budget - price;

    db.run(
      `INSERT INTO players (auction_id, name, sold_price, team_id, status)
       VALUES (?, ?, ?, ?, 'SOLD')`,
      [auctionId, playerName, price, tid],
      function (insertErr) {
        if (insertErr) return res.status(500).json({ error: insertErr.message });

        db.run(`UPDATE teams SET remaining_budget=? WHERE id=?`, [newRemaining, tid]);
        db.run(
          `UPDATE auction_state SET current_player_name=NULL, current_price=0 WHERE auction_id=?`,
          [auctionId]
        );

        const payload = {
          auctionId: Number(auctionId),
          playerName,
          soldPrice: price,
          teamId: tid,
          teamName: team.name,
          remainingBudget: newRemaining,
        };
        const io = getIo(req);
        if (io) io.emit("player:sold", payload);
        res.json({ success: true, ...payload });
      }
    );
  });
});

/* =========================
   MARK UNSOLD (ADMIN)
========================= */
router.post("/:auctionId/unsold", adminAuth, (req, res) => {
  const auctionId = req.params.auctionId;
  const { playerName } = req.body;

  db.get(
    `SELECT current_player_name, current_price FROM auction_state WHERE auction_id=?`,
    [auctionId],
    (err, state) => {
      if (err) return res.status(500).json({ error: err.message });

      const name = (playerName || state?.current_player_name || "").trim();
      if (!name) return res.status(400).json({ error: "No player to mark unsold" });

      db.run(
        `INSERT INTO players (auction_id, name, sold_price, team_id, status)
         VALUES (?, ?, 0, NULL, 'UNSOLD')`,
        [auctionId, name],
        () => {
          db.run(
            `UPDATE auction_state SET current_player_name=NULL, current_price=0 WHERE auction_id=?`,
            [auctionId]
          );

          const payload = {
            auctionId: Number(auctionId),
            playerName: name,
          };
          const io = getIo(req);
          if (io) io.emit("player:unsold", payload);
          res.json({ success: true, ...payload });
        }
      );
    }
  );
});

/* =========================
   PUBLIC: CURRENT STATE
========================= */
router.get("/:auctionId/state", (req, res) => {
  const { auctionId } = req.params;

  db.get(
    `
    SELECT
      a.id,
      a.name,
      a.base_price,
      a.status,
      s.current_player_name,
      s.current_price,
      s.is_live
    FROM auctions a
    LEFT JOIN auction_state s ON a.id = s.auction_id
    WHERE a.id = ?
    `,
    [auctionId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: "Auction not found" });

      res.json({
        id: row.id,
        name: row.name,
        basePrice: row.base_price,
        status: row.status,
        currentPlayer: row.current_player_name || null,
        currentPrice: row.current_price || 0,
        isLive: Boolean(row.is_live),
      });
    }
  );
});

/* =========================
   PUBLIC: TEAMS
========================= */
router.get("/:auctionId/teams", (req, res) => {
  db.all(
    `SELECT id, name, total_budget, remaining_budget FROM teams WHERE auction_id=? ORDER BY id`,
    [req.params.auctionId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

/* =========================
   PUBLIC: SUMMARY
========================= */
router.get("/:auctionId/summary", (req, res) => {
  const { auctionId } = req.params;

  db.all(
    `
    SELECT
      t.id AS teamId,
      t.name AS teamName,
      t.total_budget,
      t.remaining_budget,
      p.name AS playerName,
      p.sold_price,
      p.status AS playerStatus
    FROM teams t
    LEFT JOIN players p ON p.team_id = t.id AND p.status = 'SOLD'
    WHERE t.auction_id = ?
    ORDER BY t.id
    `,
    [auctionId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const summary = {};
      (rows || []).forEach((row) => {
        if (!summary[row.teamId]) {
          summary[row.teamId] = {
            teamId: row.teamId,
            teamName: row.teamName,
            totalBudget: row.total_budget,
            remainingBudget: row.remaining_budget,
            players: [],
            totalSpent: 0,
          };
        }

        if (row.playerName) {
          summary[row.teamId].players.push({
            name: row.playerName,
            price: row.sold_price,
          });
          summary[row.teamId].totalSpent += row.sold_price || 0;
        }
      });

      res.json(Object.values(summary));
    }
  );
});

/* =========================
   PUBLIC: EXPORT CSV
========================= */
router.get("/:auctionId/export", (req, res) => {
  const { auctionId } = req.params;

  db.all(
    `
    SELECT
      t.name AS teamName,
      p.name AS playerName,
      p.sold_price AS soldPrice,
      p.status
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE p.auction_id = ?
    ORDER BY p.status DESC, t.name, p.name
    `,
    [auctionId],
    (err, rows) => {
      if (err) return res.status(500).send("Failed to export");

      let csv = "Team,Player,Sold Price,Status\n";
      (rows || []).forEach((row) => {
        const team = row.teamName || "UNSOLD";
        csv += `"${team}","${row.playerName}",${row.soldPrice || 0},${row.status}\n`;
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=auction_${auctionId}_players.csv`
      );
      res.send(csv);
    }
  );
});

module.exports = router;
