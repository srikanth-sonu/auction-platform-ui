const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "auction.db");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error opening database:", err.message);
  else console.log("Database connected:", dbPath);
});

function columnExists(table, column) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return resolve(false);
      resolve((rows || []).some((r) => r.name === column));
    });
  });
}

function addColumn(table, column, definition) {
  return columnExists(table, column).then((exists) => {
    if (exists) return;
    return new Promise((resolve, reject) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      pin TEXT DEFAULT '1234',
      primary_color TEXT DEFAULT '#0B6E4F',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER,
      name TEXT NOT NULL,
      base_price INTEGER NOT NULL DEFAULT 500,
      bid_increment INTEGER NOT NULL DEFAULT 100,
      max_squad_size INTEGER DEFAULT 11,
      max_overseas INTEGER DEFAULT 4,
      timer_seconds INTEGER DEFAULT 0,
      status TEXT DEFAULT 'CREATED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER,
      name TEXT,
      short_code TEXT,
      color TEXT DEFAULT '#0B6E4F',
      total_budget INTEGER,
      remaining_budget INTEGER,
      player_count INTEGER DEFAULT 0,
      overseas_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'BAT',
      category TEXT DEFAULT 'UNCAPPED',
      country_type TEXT DEFAULT 'LOCAL',
      base_price INTEGER DEFAULT 500,
      sold_price INTEGER,
      team_id INTEGER,
      status TEXT DEFAULT 'AVAILABLE',
      sort_order INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auction_state (
      auction_id INTEGER PRIMARY KEY,
      current_player_id INTEGER,
      current_player_name TEXT,
      current_price INTEGER DEFAULT 0,
      current_team_id INTEGER,
      is_live INTEGER DEFAULT 0,
      timer_ends_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER,
      event_type TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  Promise.all([
    addColumn("auctions", "club_id", "INTEGER"),
    addColumn("auctions", "max_overseas", "INTEGER DEFAULT 4"),
    addColumn("auctions", "timer_seconds", "INTEGER DEFAULT 0"),
    addColumn("auctions", "bid_increment", "INTEGER NOT NULL DEFAULT 100"),
    addColumn("auctions", "max_squad_size", "INTEGER DEFAULT 11"),
    addColumn("teams", "short_code", "TEXT"),
    addColumn("teams", "color", "TEXT DEFAULT '#0B6E4F'"),
    addColumn("teams", "player_count", "INTEGER DEFAULT 0"),
    addColumn("teams", "overseas_count", "INTEGER DEFAULT 0"),
    addColumn("players", "role", "TEXT DEFAULT 'BAT'"),
    addColumn("players", "category", "TEXT DEFAULT 'UNCAPPED'"),
    addColumn("players", "country_type", "TEXT DEFAULT 'LOCAL'"),
    addColumn("players", "base_price", "INTEGER DEFAULT 500"),
    addColumn("players", "sort_order", "INTEGER DEFAULT 0"),
    addColumn("auction_state", "current_player_id", "INTEGER"),
    addColumn("auction_state", "current_team_id", "INTEGER"),
    addColumn("auction_state", "timer_ends_at", "TEXT"),
  ]).catch((err) => console.error("Migration error:", err.message));
});

module.exports = db;
