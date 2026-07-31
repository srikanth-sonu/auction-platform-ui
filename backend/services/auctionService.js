const db = require("../db");

const ROLES = new Set(["BAT", "BOWL", "AR", "WK"]);

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

async function ensureState(auctionId) {
  await run(
    `INSERT INTO auction_state
       (auction_id, current_player_id, current_player_name, current_price, current_team_id, is_live)
     VALUES (?, NULL, NULL, 0, NULL, 0)
     ON CONFLICT(auction_id) DO NOTHING`,
    [auctionId]
  );
}

async function getAuction(auctionId) {
  return get(`SELECT * FROM auctions WHERE id=?`, [auctionId]);
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
    `SELECT id, name, total_budget, remaining_budget, player_count
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
    `SELECT p.*, t.name AS team_name
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

  return {
    id: auction.id,
    name: auction.name,
    basePrice: auction.base_price,
    bidIncrement: auction.bid_increment || 100,
    maxSquadSize: auction.max_squad_size || 0,
    status: auction.status,
    isLive: Boolean(state.is_live),
    currentPlayer: currentPlayer
      ? {
          id: currentPlayer.id,
          name: currentPlayer.name,
          role: currentPlayer.role || "BAT",
          basePrice: currentPlayer.base_price || auction.base_price,
          status: currentPlayer.status,
        }
      : null,
    currentPrice: state.current_price || 0,
    leadingTeam: leadingTeam
      ? {
          id: leadingTeam.id,
          name: leadingTeam.name,
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
  };
}

async function setPlayerOnBlock(auctionId, playerId, fallbackName, fallbackBase) {
  const auction = await getAuction(auctionId);
  if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });

  await ensureState(auctionId);

  // Clear any previous BIDDING player back to AVAILABLE if still on block
  const prev = await getState(auctionId);
  if (prev.current_player_id) {
    await run(
      `UPDATE players SET status='AVAILABLE' WHERE id=? AND status='BIDDING'`,
      [prev.current_player_id]
    );
  }

  let player = null;
  if (playerId) {
    player = await get(
      `SELECT * FROM players WHERE id=? AND auction_id=?`,
      [playerId, auctionId]
    );
    if (!player) throw Object.assign(new Error("Player not found"), { status: 404 });
    if (player.status === "SOLD") {
      throw Object.assign(new Error("Player already sold"), { status: 400 });
    }
  } else if (fallbackName) {
    const base = Number(fallbackBase) || auction.base_price || 500;
    const inserted = await run(
      `INSERT INTO players (auction_id, name, role, base_price, status, sort_order)
       VALUES (?, ?, 'BAT', ?, 'AVAILABLE', 9999)`,
      [auctionId, fallbackName.trim(), base]
    );
    player = await get(`SELECT * FROM players WHERE id=?`, [inserted.lastID]);
  } else {
    throw Object.assign(new Error("Player is required"), { status: 400 });
  }

  const price = player.base_price || auction.base_price || 500;

  await run(`UPDATE players SET status='BIDDING' WHERE id=?`, [player.id]);
  await run(
    `UPDATE auction_state
     SET current_player_id=?, current_player_name=?, current_price=?, current_team_id=NULL, is_live=1
     WHERE auction_id=?`,
    [player.id, player.name, price, auctionId]
  );

  if (auction.status !== "LIVE") {
    await run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
  }

  return buildLivePayload(auctionId);
}

async function placeBid(auctionId, { amount, teamId, direction }) {
  const auction = await getAuction(auctionId);
  if (!auction) throw Object.assign(new Error("Auction not found"), { status: 404 });

  const state = await getState(auctionId);
  if (!state.current_player_name) {
    throw Object.assign(new Error("No player currently up for bid"), { status: 400 });
  }

  const increment = auction.bid_increment || 100;

  let playerBase = auction.base_price || 500;
  if (state.current_player_id) {
    const player = await get(`SELECT base_price FROM players WHERE id=?`, [state.current_player_id]);
    if (player?.base_price) playerBase = player.base_price;
  }

  let newPrice;
  if (Number.isFinite(Number(amount))) {
    newPrice = Number(amount);
  } else if (direction === "down") {
    newPrice = Math.max(playerBase, (state.current_price || playerBase) - increment);
  } else {
    newPrice = (state.current_price || playerBase) + increment;
  }

  newPrice = Math.max(playerBase, newPrice);

  let nextTeamId = state.current_team_id || null;
  if (teamId) {
    const team = await getTeam(teamId, auctionId);
    if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });
    if (team.remaining_budget < newPrice) {
      throw Object.assign(new Error("Insufficient budget for this bid"), { status: 400 });
    }
    if (auction.max_squad_size > 0 && team.player_count >= auction.max_squad_size) {
      throw Object.assign(new Error("Team squad is full"), { status: 400 });
    }
    nextTeamId = team.id;
  }

  await run(
    `UPDATE auction_state SET current_price=?, current_team_id=? WHERE auction_id=?`,
    [newPrice, nextTeamId, auctionId]
  );

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

  const newRemaining = team.remaining_budget - price;

  if (state.current_player_id) {
    await run(
      `UPDATE players
       SET status='SOLD', sold_price=?, team_id=?
       WHERE id=?`,
      [price, tid, state.current_player_id]
    );
  } else {
    await run(
      `INSERT INTO players (auction_id, name, role, base_price, sold_price, team_id, status)
       VALUES (?, ?, 'BAT', ?, ?, ?, 'SOLD')`,
      [auctionId, state.current_player_name, price, price, tid]
    );
  }

  await run(
    `UPDATE teams SET remaining_budget=?, player_count=player_count+1 WHERE id=?`,
    [newRemaining, tid]
  );

  await run(
    `UPDATE auction_state
     SET current_player_id=NULL, current_player_name=NULL, current_price=0, current_team_id=NULL
     WHERE auction_id=?`,
    [auctionId]
  );

  const live = await buildLivePayload(auctionId);
  return {
    ...live,
    lastSold: {
      playerName: state.current_player_name,
      soldPrice: price,
      teamId: tid,
      teamName: team.name,
      remainingBudget: newRemaining,
    },
  };
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
     SET current_player_id=NULL, current_player_name=NULL, current_price=0, current_team_id=NULL
     WHERE auction_id=?`,
    [auctionId]
  );

  const live = await buildLivePayload(auctionId);
  return {
    ...live,
    lastUnsold: { playerName: state.current_player_name },
  };
}

module.exports = {
  ROLES,
  run,
  get,
  all,
  normalizeRole,
  ensureState,
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
};
