const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");

const PORT = 4055;
const AUTH = { username: "admin", password: "admin123" };

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, body: json, raw });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

describe("KPL auction API", () => {
  before(async () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "admin123";
    process.env.PORT = String(PORT);
    const dbPath = path.join(__dirname, "..", "auction.db");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    require("../server");
    for (let i = 0; i < 40; i++) {
      try {
        const res = await request("GET", "/health");
        if (res.status === 200) return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("Server did not start");
  });

  it("creates club auction with team cards payload and runs night flow", async () => {
    const created = await request(
      "POST",
      "/api/auction",
      {
        name: "Mega Auction",
        clubName: "Demo Club",
        teams: [
          { name: "Warriors", shortCode: "WAR", color: "#0B6E4F" },
          { name: "Titans", shortCode: "TIT", color: "#1D4E89" },
        ],
        budget: 10000000,
        basePrice: 500000,
        bidIncrement: 50000,
        maxSquadSize: 15,
        maxOverseas: 4,
        players: [
          {
            name: "Virat",
            role: "BAT",
            category: "CAPPED",
            countryType: "LOCAL",
            basePrice: 500000,
          },
          {
            name: "Rashid",
            role: "BOWL",
            category: "CAPPED",
            countryType: "OVERSEAS",
            basePrice: 500000,
          },
        ],
      },
      AUTH
    );
    assert.equal(created.status, 200);
    const auctionId = created.body.auctionId;

    const clubs = await request("GET", "/api/auction/clubs");
    assert.ok(clubs.body.some((c) => c.name === "Demo Club"));

    await request("POST", `/api/auction/${auctionId}/start`, {}, AUTH);

    const roster = await request("GET", `/api/auction/${auctionId}/players`);
    const virat = roster.body.find((p) => p.name === "Virat");
    await request(
      "POST",
      `/api/auction/${auctionId}/set-player`,
      { playerId: virat.id },
      AUTH
    );

    const teams = await request("GET", `/api/auction/${auctionId}/teams`);
    const warriors = teams.body.find((t) => t.name === "Warriors");

    const bid = await request(
      "POST",
      `/api/auction/${auctionId}/bid`,
      { teamId: warriors.id, direction: "up" },
      AUTH
    );
    assert.equal(bid.body.leadingTeam.name, "Warriors");
    assert.ok(bid.body.currentPrice > 500000);

    const sell = await request(
      "POST",
      `/api/auction/${auctionId}/sell`,
      { teamId: warriors.id },
      AUTH
    );
    assert.equal(sell.body.lastSold.playerName, "Virat");

    const undo = await request(
      "POST",
      `/api/auction/${auctionId}/undo-sale`,
      {},
      AUTH
    );
    assert.equal(undo.status, 200);

    const next = await request(
      "POST",
      `/api/auction/${auctionId}/next-player`,
      {},
      AUTH
    );
    assert.ok(next.body.currentPlayer);

    await request("POST", `/api/auction/${auctionId}/unsold`, {}, AUTH);
    const summary = await request("GET", `/api/auction/${auctionId}/summary`);
    assert.equal(summary.status, 200);
    assert.ok(Array.isArray(summary.body.teams));
  });
});
