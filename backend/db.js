const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "auction.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Database connected");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_price INTEGER NOT NULL DEFAULT 500,
      status TEXT DEFAULT 'CREATED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER,
      name TEXT,
      total_budget INTEGER,
      remaining_budget INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER,
      name TEXT,
      sold_price INTEGER,
      team_id INTEGER,
      status TEXT DEFAULT 'UNSOLD'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auction_state (
      auction_id INTEGER PRIMARY KEY,
      current_player_name TEXT,
      current_price INTEGER DEFAULT 0,
      is_live INTEGER DEFAULT 0
    )
  `);
});

module.exports = db;
