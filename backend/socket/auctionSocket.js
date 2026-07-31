const db = require("../db");

function ensureState(auctionId, callback) {
  db.run(
    `INSERT INTO auction_state (auction_id, current_player_name, current_price, is_live)
     VALUES (?, NULL, 0, 0)
     ON CONFLICT(auction_id) DO NOTHING`,
    [auctionId],
    callback
  );
}

module.exports = (io, socket) => {
  socket.on("auction:join", ({ auctionId }) => {
    if (!auctionId) return;
    socket.join(`auction:${auctionId}`);
  });

  socket.on("auction:start", ({ auctionId }) => {
    if (!auctionId) return;

    ensureState(auctionId, () => {
      db.run(`UPDATE auctions SET status='LIVE' WHERE id=?`, [auctionId]);
      db.run(`UPDATE auction_state SET is_live=1 WHERE auction_id=?`, [auctionId]);
      io.emit("auction:update", { auctionId, status: "LIVE" });
    });
  });

  socket.on("player:set", ({ auctionId, playerName, basePrice }) => {
    if (!auctionId || !playerName) return;
    const price = Number(basePrice) || 500;

    ensureState(auctionId, () => {
      db.run(
        `UPDATE auction_state
         SET current_player_name=?, current_price=?, is_live=1
         WHERE auction_id=?`,
        [playerName.trim(), price, auctionId]
      );

      io.emit("player:update", {
        auctionId,
        playerName: playerName.trim(),
        currentPrice: price,
      });
    });
  });

  socket.on("bid:increase", ({ auctionId, amount }) => {
    if (!auctionId) return;

    db.get(
      `SELECT current_player_name, current_price FROM auction_state WHERE auction_id=?`,
      [auctionId],
      (err, row) => {
        if (!row || !row.current_player_name) return;

        let newPrice;
        if (Number.isFinite(Number(amount))) {
          newPrice = Number(amount);
        } else {
          const increment = row.current_price < 1000 ? 100 : 200;
          newPrice = row.current_price + increment;
        }

        db.run(
          `UPDATE auction_state SET current_price=? WHERE auction_id=?`,
          [newPrice, auctionId]
        );

        io.emit("player:update", {
          auctionId,
          playerName: row.current_player_name,
          currentPrice: newPrice,
        });
      }
    );
  });

  socket.on("bid:decrease", ({ auctionId, amount }) => {
    if (!auctionId) return;

    db.get(
      `SELECT a.base_price, s.current_player_name, s.current_price
       FROM auction_state s
       JOIN auctions a ON a.id = s.auction_id
       WHERE s.auction_id=?`,
      [auctionId],
      (err, row) => {
        if (!row || !row.current_player_name) return;

        const floor = row.base_price || 500;
        let newPrice;
        if (Number.isFinite(Number(amount))) {
          newPrice = Math.max(floor, Number(amount));
        } else {
          if (row.current_price <= floor) return;
          const decrement = row.current_price > 1000 ? 200 : 100;
          newPrice = Math.max(floor, row.current_price - decrement);
        }

        db.run(
          `UPDATE auction_state SET current_price=? WHERE auction_id=?`,
          [newPrice, auctionId]
        );

        io.emit("player:update", {
          auctionId,
          playerName: row.current_player_name,
          currentPrice: newPrice,
        });
      }
    );
  });

  socket.on("player:sell", ({ auctionId, teamId }) => {
    if (!auctionId || !teamId) return;

    db.get(
      `SELECT current_player_name, current_price
       FROM auction_state WHERE auction_id=?`,
      [auctionId],
      (err, state) => {
        if (!state || !state.current_player_name) return;

        db.get(
          `SELECT remaining_budget, name FROM teams WHERE id=? AND auction_id=?`,
          [teamId, auctionId],
          (teamErr, team) => {
            if (!team) return;

            if (team.remaining_budget < state.current_price) {
              socket.emit("error", { message: "Insufficient budget" });
              return;
            }

            const newRemaining = team.remaining_budget - state.current_price;

            db.run(`UPDATE teams SET remaining_budget=? WHERE id=?`, [
              newRemaining,
              teamId,
            ]);

            db.run(
              `INSERT INTO players
               (auction_id, name, sold_price, team_id, status)
               VALUES (?, ?, ?, ?, 'SOLD')`,
              [
                auctionId,
                state.current_player_name,
                state.current_price,
                teamId,
              ]
            );

            db.run(
              `UPDATE auction_state
               SET current_player_name=NULL, current_price=0
               WHERE auction_id=?`,
              [auctionId]
            );

            io.emit("player:sold", {
              auctionId,
              playerName: state.current_player_name,
              soldPrice: state.current_price,
              teamId,
              teamName: team.name,
              remainingBudget: newRemaining,
            });
          }
        );
      }
    );
  });

  socket.on("player:unsold", ({ auctionId }) => {
    if (!auctionId) return;

    db.get(
      `SELECT current_player_name FROM auction_state WHERE auction_id=?`,
      [auctionId],
      (err, state) => {
        if (!state || !state.current_player_name) return;

        db.run(
          `INSERT INTO players (auction_id, name, sold_price, team_id, status)
           VALUES (?, ?, 0, NULL, 'UNSOLD')`,
          [auctionId, state.current_player_name]
        );

        db.run(
          `UPDATE auction_state
           SET current_player_name=NULL, current_price=0
           WHERE auction_id=?`,
          [auctionId]
        );

        io.emit("player:unsold", {
          auctionId,
          playerName: state.current_player_name,
        });
      }
    );
  });
};
