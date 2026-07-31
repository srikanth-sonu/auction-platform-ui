const db = require("../db");

const ROLES = new Set(["BAT", "BOWL", "AR", "WK"]);
const CATEGORIES = new Set(["CAPPED", "UNCAPPED", "ICON", "GRADE_A", "GRADE_B", "GRADE_C"]);
const COUNTRY_TYPES = new Set(["LOCAL", "OVERSEAS"]);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function normalizeRole(role) {
  const value = String(role || "BAT").toUpperCase();
  return ROLES.has(value) ? value : "BAT";
}

function normalizeCategory(category) {
  const value = String(category || "UNCAPPED").toUpperCase().replace(/\s+/g, "_");
  if (value === "A") return "GRADE_A";
  if (value === "B") return "GRADE_B";
  if (value === "C") return "GRADE_C";
  return CATEGORIES.has(value) ? value : "UNCAPPED";
}

function normalizeCountry(countryType) {
  const value = String(countryType || "LOCAL").toUpperCase();
  if (["FOREIGN", "INTL", "INTERNATIONAL", "OS"].includes(value)) return "OVERSEAS";
  return COUNTRY_TYPES.has(value) ? value : "LOCAL";
}

function tierIncrement(price, baseIncrement = 100) {
  const p = Number(price) || 0;
  if (p >= 10000) return Math.max(baseIncrement, 1000);
  if (p >= 5000) return Math.max(baseIncrement, 500);
  if (p >= 2000) return Math.max(baseIncrement, 200);
  if (p >= 1000) return Math.max(baseIncrement, 100);
  return baseIncrement || 100;
}

async function ensureState(auctionId) {
  await run(
    `INSERT INTO auction_state
       (auction_id, current_player_id, current_player_name, current_price, current_team_id, is_live)
     VALUES (?, NULL, NULL, 0, NULL, 0)
     ON CONFLICT(auction_id) DO NOTHING`,
    [auctionId]
  );
}

async function logEvent(auctionId, eventType, payload) {
  await run(
    `INSERT INTO auction_events (auction_id, event_type, payload) VALUES (?, ?, ?)`,
    [auctionId, eventType, JSON.stringify(payload || {})]
  );
}

async function getAuction(auctionId) {
  return get(
    `SELECT a.*, c.name AS club_name, c.primary_color AS club_color, c.slug AS club_slug
     FROM auctions a
     LEFT JOIN clubs c ON c.id = a.club_id
     WHERE a.id=?`,
    [auctionId]
  );
}

async function getState(auctionId) {
  await ensureState(auctionId);
  return get(`SELECT * FROM auction_state WHERE auction_id=?`, [auctionId]);
}

async function getTeam(teamId, auctionId) {
  return get(`SELECT * FROM teams WHERE id=? AND auction_id=?`, [teamId, auctionId]);
}

async function listTeams(auctionId) {
  return all(
    `SELECT id, name, short_code, color, total_budget, remaining_budget, player_count, overseas_count
     FROM teams WHERE auction_id=? ORDER BY id`,
    [auctionId]
  );
}

async function listPlayers(auctionId, status) {
  if (status) {
    return all(
      `SELECT * FROM players WHERE auction_id=? AND status=? ORDER BY sort_order, id`,
      [auctionId, status]
    );
  }
  return all(
    `SELECT p.*, t.name AS team_name, t.short_code AS team_code, t.color AS team_color
     FROM players p
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE p.auction_id=?
     ORDER BY
       CASE p.status
         WHEN 'BIDDING' THEN 0
         WHEN 'AVAILABLE' THEN 1
         WHEN 'UNSOLD' THEN 2
         WHEN 'SOLD' THEN 3
         ELSE 4
       END,
       p.sort_order, p.id`,
    [auctionId]
  );
}

async function recentEvents(auctionId, limit = 12) {
  return all(
    `SELECT id, event_type, payload, created_at
     FROM auction_events WHERE auction_id=?
     ORDER BY id DESC LIMIT ?`,
    [auctionId, limit]
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      payload: (() => {
        try {
          return JSON.parse(r.payload || "{}");
        } catch {
          return {};
        }
      })(),
    }))
  );
}

async function buildLivePayload(auctionId) {
  const auction = await getAuction(auctionId);
  if (!auction) return null;

  const state = await getState(auctionId);
  const teams = await listTeams(auctionId);
  let currentPlayer = null;
  let leadingTeam = null;

  if (state.current_player_id) {
    currentPlayer = await get(`SELECT * FROM players WHERE id=?`, [state.current_player_id]);
  } else if (state.current_player_name) {
    currentPlayer = {
      id: null,
      name: state.current_player_name,
      role: "BAT",
      category: "UNCAPPED",
      country_type: "LOCAL",
      base_price: auction.base_price,
      status: "BIDDING",
    };
  }

  if (state.current_team_id) {
    leadingTeam = teams.find((t) => t.id === state.current_team_id) || null;
  }

  const counts = await get(
    `SELECT
       SUM(CASE WHEN status='AVAILABLE' THEN 1 ELSE 0 END) AS available,
       SUM(CASE WHEN status='SOLD' THEN 1 ELSE 0 END) AS sold,
       SUM(CASE WHEN status='UNSOLD' THEN 1 ELSE 0 END) AS unsold,
       COUNT(*) AS total
     FROM players WHERE auction_id=?`,
    [auctionId]
  );

  const nextIncrement = tierIncrement(
    state.current_price || auction.base_price,
    auction.bid_increment || 100
  );

  return {
    id: auction.id,
    name: auction.name,
    clubId: auction.club_id,
    clubName: auction.club_name || null,
    clubColor: auction.club_color || "#0B6E4F",
    basePrice: auction.base_price,
    bidIncrement: auction.bid_increment || 100,
    nextIncrement,
    maxSquadSize: auction.max_squad_size || 0,
    maxOverseas: auction.max_overseas ?? 4,
    timerSeconds: auction.timer_seconds || 0,
    timerEndsAt: state.timer_ends_at || null,
    status: auction.status,
    isLive: Boolean(state.is_live),
    currentPlayer: currentPlayer
      ? {
          id: currentPlayer.id,
          name: currentPlayer.name,
          role: currentPlayer.role || "BAT",
          category: currentPlayer.category || "UNCAPPED",
          countryType: currentPlayer.country_type || "LOCAL",
          basePrice: currentPlayer.base_price || auction.base_price,
          status: currentPlayer.status,
        }
      : null,
    currentPrice: state.current_price || 0,
    leadingTeam: leadingTeam
      ? {
          id: leadingTeam.id,
          name: leadingTeam.name,
          shortCode: leadingTeam.short_code,
          color: leadingTeam.color,
          remainingBudget: leadingTeam.remaining_budget,
        }
      : null,
    teams,
    counts: {
      available: counts?.available || 0,
      sold: counts?.sold || 0,
      unsold: counts?.unsold || 0,
      total: counts?.total || 0,
    },
    recent: await recentEvents(auctionId, 8),
  };
}

async function setPlayerOnBlock(auctionId, playerId, fallbackName, fallbackBase) {
  const auction = await getAuction(auctionId);
  if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });
  await ensureState(auctionId);

  const prev = await getState(auctionId);
  if (prev.current_player_id) {
    await run(
      `UPDATE players SET status='AVAILABLE' WHERE id=? AND status='BIDDING'`,
      [prev.current_player_id]
    );
  }

  let player = null;
  if (playerId) {
    player = await get(`SELECT * FROM players WHERE id=? AND auction_id=?`, [
      playerId,
      auctionId,
    ]);
    if (!player) throw Object.assign(new Error("Player not found"), { status: 404 });
    if (player.status === "SOLD") {
      throw Object.assign(new Error("Player already sold"), { status: 400 });
    }
  } else if (fallbackName) {
    const base = Number(fallbackBase) || auction.base_price || 500;
    const inserted = await run(
      `INSERT INTO players
         (auction_id, name, role, category, country_type, base_price, status, sort_order)
       VALUES (?, ?, 'BAT', 'UNCAPPED', 'LOCAL', ?, 'AVAILABLE', 9999)`,
      [auctionId, fallbackName.trim(), base]
    );
    player = await get(`SELECT * FROM players WHERE id=?`, [inserted.lastID]);
  } else {
    throw Object.assign(new Error("Player is required"), { status: 400 });
  }

  const price = player.base_price || auction.base_price || 500;
  let timerEndsAt = null;
  if (auction.timer_seconds > 0) {
    timerEndsAt = new Date(Date.now() + auction.timer_seconds * 1000).toISOString();
  }

  await run(`UPDATE players SET status='BIDDING' WHERE id=?`, [player.id]);
  await run(
    `UPDATE auction_state
     SET current_player_id=?, current_player_name=?, current_price=?, current_team_id=NULL,
         is_live=1, timer_ends_at=?
     WHERE auction_id=?`,
    [player.id, player.name, price, timerEndsAt, auctionId]
  );

  if (auction.status !== "LIVE") {
    await run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
  }

  await logEvent(auctionId, "PLAYER_SET", { playerId: player.id, name: player.name, price });
  return buildLivePayload(auctionId);
}

async function placeBid(auctionId, { amount, teamId, direction }) {
  const auction = await getAuction(auctionId);
  if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });

  const state = await getState(auctionId);
  if (!state.current_player_name) {
    throw Object.assign(new Error("No player currently up for bid"), { status: 400 });
  }

  let player = null;
  if (state.current_player_id) {
    player = await get(`SELECT * FROM players WHERE id=?`, [state.current_player_id]);
  }

  const playerBase = player?.base_price || auction.base_price || 500;
  const step = tierIncrement(state.current_price || playerBase, auction.bid_increment || 100);

  let newPrice;
  if (Number.isFinite(Number(amount))) {
    newPrice = Number(amount);
  } else if (direction === "down") {
    newPrice = Math.max(playerBase, (state.current_price || playerBase) - step);
  } else {
    newPrice = (state.current_price || playerBase) + step;
  }
  newPrice = Math.max(playerBase, newPrice);

  let nextTeamId = state.current_team_id || null;
  if (teamId) {
    const team = await getTeam(teamId, auctionId);
    if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });
    if (team.remaining_budget < newPrice) {
      throw Object.assign(new Error("Insufficient purse for this bid"), { status: 400 });
    }
    if (auction.max_squad_size > 0 && team.player_count >= auction.max_squad_size) {
      throw Object.assign(new Error("Team squad is full"), { status: 400 });
    }
    if (
      player?.country_type === "OVERSEAS" &&
      auction.max_overseas > 0 &&
      team.overseas_count >= auction.max_overseas &&
      state.current_team_id !== team.id
    ) {
      // only block if they don't already "hold" the bid as leading for same overseas player
      if (Number(state.current_team_id) !== Number(team.id)) {
        throw Object.assign(new Error("Overseas player quota full for this team"), {
          status: 400,
        });
      }
    }
    nextTeamId = team.id;
  }

  let timerEndsAt = state.timer_ends_at;
  if (auction.timer_seconds > 0) {
    timerEndsAt = new Date(Date.now() + auction.timer_seconds * 1000).toISOString();
  }

  await run(
    `UPDATE auction_state SET current_price=?, current_team_id=?, timer_ends_at=? WHERE auction_id=?`,
    [newPrice, nextTeamId, timerEndsAt, auctionId]
  );

  await logEvent(auctionId, "BID", { amount: newPrice, teamId: nextTeamId });
  return buildLivePayload(auctionId);
}

async function sellCurrentPlayer(auctionId, teamId) {
  const state = await getState(auctionId);
  if (!state.current_player_name) {
    throw Object.assign(new Error("No player on the block"), { status: 400 });
  }

  const auction = await getAuction(auctionId);
  const tid = Number(teamId || state.current_team_id);
  if (!tid) throw Object.assign(new Error("Select the winning team"), { status: 400 });

  const team = await getTeam(tid, auctionId);
  if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });

  const price = state.current_price || 0;
  if (team.remaining_budget < price) {
    throw Object.assign(new Error("Insufficient budget"), { status: 400 });
  }
  if (auction.max_squad_size > 0 && team.player_count >= auction.max_squad_size) {
    throw Object.assign(new Error("Team squad is full"), { status: 400 });
  }

  let player = null;
  if (state.current_player_id) {
    player = await get(`SELECT * FROM players WHERE id=?`, [state.current_player_id]);
  }

  if (player?.country_type === "OVERSEAS" && auction.max_overseas > 0) {
    if (team.overseas_count >= auction.max_overseas) {
      throw Object.assign(new Error("Overseas player quota full"), { status: 400 });
    }
  }

  const newRemaining = team.remaining_budget - price;
  const overseasInc = player?.country_type === "OVERSEAS" ? 1 : 0;

  if (state.current_player_id) {
    await run(
      `UPDATE players SET status='SOLD', sold_price=?, team_id=? WHERE id=?`,
      [price, tid, state.current_player_id]
    );
  } else {
    await run(
      `INSERT INTO players
         (auction_id, name, role, category, country_type, base_price, sold_price, team_id, status)
       VALUES (?, ?, 'BAT', 'UNCAPPED', 'LOCAL', ?, ?, ?, 'SOLD')`,
      [auctionId, state.current_player_name, price, price, tid]
    );
  }

  await run(
    `UPDATE teams
     SET remaining_budget=?, player_count=player_count+1, overseas_count=overseas_count+?
     WHERE id=?`,
    [newRemaining, overseasInc, tid]
  );

  await run(
    `UPDATE auction_state
     SET current_player_id=NULL, current_player_name=NULL, current_price=0,
         current_team_id=NULL, timer_ends_at=NULL
     WHERE auction_id=?`,
    [auctionId]
  );

  const soldPayload = {
    playerName: state.current_player_name,
    playerId: state.current_player_id,
    soldPrice: price,
    teamId: tid,
    teamName: team.name,
    remainingBudget: newRemaining,
  };
  await logEvent(auctionId, "SOLD", soldPayload);

  const live = await buildLivePayload(auctionId);
  return { ...live, lastSold: soldPayload };
}

async function unsoldCurrentPlayer(auctionId) {
  const state = await getState(auctionId);
  if (!state.current_player_name) {
    throw Object.assign(new Error("No player on the block"), { status: 400 });
  }

  if (state.current_player_id) {
    await run(
      `UPDATE players SET status='UNSOLD', sold_price=0, team_id=NULL WHERE id=?`,
      [state.current_player_id]
    );
  } else {
    await run(
      `INSERT INTO players (auction_id, name, sold_price, team_id, status)
       VALUES (?, ?, 0, NULL, 'UNSOLD')`,
      [auctionId, state.current_player_name]
    );
  }

  await run(
    `UPDATE auction_state
     SET current_player_id=NULL, current_player_name=NULL, current_price=0,
         current_team_id=NULL, timer_ends_at=NULL
     WHERE auction_id=?`,
    [auctionId]
  );

  const payload = { playerName: state.current_player_name, playerId: state.current_player_id };
  await logEvent(auctionId, "UNSOLD", payload);
  const live = await buildLivePayload(auctionId);
  return { ...live, lastUnsold: payload };
}

async function undoLastSale(auctionId) {
  const last = await get(
    `SELECT * FROM auction_events
     WHERE auction_id=? AND event_type='SOLD'
     ORDER BY id DESC LIMIT 1`,
    [auctionId]
  );
  if (!last) throw Object.assign(new Error("No sale to undo"), { status: 400 });

  const payload = JSON.parse(last.payload || "{}");
  const player = payload.playerId
    ? await get(`SELECT * FROM players WHERE id=?`, [payload.playerId])
    : await get(
        `SELECT * FROM players WHERE auction_id=? AND name=? AND status='SOLD' ORDER BY id DESC LIMIT 1`,
        [auctionId, payload.playerName]
      );

  if (!player || player.status !== "SOLD") {
    throw Object.assign(new Error("Sold player not found"), { status: 404 });
  }

  const team = await getTeam(player.team_id, auctionId);
  if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });

  const overseasDec = player.country_type === "OVERSEAS" ? 1 : 0;
  await run(
    `UPDATE teams
     SET remaining_budget = remaining_budget + ?,
         player_count = CASE WHEN player_count > 0 THEN player_count - 1 ELSE 0 END,
         overseas_count = CASE WHEN overseas_count > ? THEN overseas_count - ? ELSE 0 END
     WHERE id=?`,
    [player.sold_price || 0, overseasDec, overseasDec, team.id]
  );

  await run(
    `UPDATE players SET status='AVAILABLE', sold_price=NULL, team_id=NULL WHERE id=?`,
    [player.id]
  );

  await run(`DELETE FROM auction_events WHERE id=?`, [last.id]);
  await logEvent(auctionId, "UNDO_SALE", {
    playerId: player.id,
    playerName: player.name,
    teamId: team.id,
  });

  return buildLivePayload(auctionId);
}

async function nextAvailablePlayer(auctionId, { random = false } = {}) {
  const rows = await all(
    `SELECT id FROM players WHERE auction_id=? AND status='AVAILABLE' ORDER BY sort_order, id`,
    [auctionId]
  );
  if (!rows.length) {
    throw Object.assign(new Error("No available players left"), { status: 400 });
  }
  const pick = random ? rows[Math.floor(Math.random() * rows.length)] : rows[0];
  return setPlayerOnBlock(auctionId, pick.id);
}

module.exports = {
  ROLES,
  run,
  get,
  all,
  normalizeRole,
  normalizeCategory,
  normalizeCountry,
  tierIncrement,
  ensureState,
  logEvent,
  getAuction,
  getState,
  getTeam,
  listTeams,
  listPlayers,
  buildLivePayload,
  setPlayerOnBlock,
  placeBid,
  sellCurrentPlayer,
  unsoldCurrentPlayer,
  undoLastSale,
  nextAvailablePlayer,
  recentEvents,
};
