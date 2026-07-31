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

  it("rejects bad login", async () => {
    const res = await request("POST", "/api/auction/login", {
      username: "admin",
      password: "wrong",
    });
    assert.equal(res.status, 401);
  });

  it("runs full auction night flow", async () => {
    const created = await request(
      "POST",
      "/api/auction",
      {
        name: "KPL Test",
        teams: ["Alpha", "Beta"],
        budget: 10000,
        basePrice: 500,
        bidIncrement: 100,
        maxSquadSize: 11,
        players: [
          { name: "Virat", role: "BAT", basePrice: 500 },
          { name: "Bumrah", role: "BOWL", basePrice: 500 },
        ],
      },
      AUTH
    );
    assert.equal(created.status, 200);
    const auctionId = created.body.auctionId;

    const start = await request(
      "POST",
      `/api/auction/${auctionId}/start`,
      {},
      AUTH
    );
    assert.equal(start.status, 200);
    assert.equal(start.body.status, "LIVE");

    const roster = await request("GET", `/api/auction/${auctionId}/players`);
    assert.equal(roster.status, 200);
    assert.equal(roster.body.length, 2);
    const virat = roster.body.find((p) => p.name === "Virat");
    assert.ok(virat);

    const setPlayer = await request(
      "POST",
      `/api/auction/${auctionId}/set-player`,
      { playerId: virat.id },
      AUTH
    );
    assert.equal(setPlayer.status, 200);
    assert.equal(setPlayer.body.currentPlayer.name, "Virat");
    assert.equal(setPlayer.body.currentPrice, 500);

    const teams = await request("GET", `/api/auction/${auctionId}/teams`);
    const alpha = teams.body.find((t) => t.name === "Alpha");

    const bid = await request(
      "POST",
      `/api/auction/${auctionId}/bid`,
      { teamId: alpha.id, direction: "up" },
      AUTH
    );
    assert.equal(bid.status, 200);
    assert.equal(bid.body.currentPrice, 600);
    assert.equal(bid.body.leadingTeam.name, "Alpha");

    const sell = await request(
      "POST",
      `/api/auction/${auctionId}/sell`,
      { teamId: alpha.id },
      AUTH
    );
    assert.equal(sell.status, 200);
    assert.equal(sell.body.lastSold.playerName, "Virat");
    assert.equal(sell.body.lastSold.soldPrice, 600);

    const bumrah = roster.body.find((p) => p.name === "Bumrah");
    await request(
      "POST",
      `/api/auction/${auctionId}/set-player`,
      { playerId: bumrah.id },
      AUTH
    );
    const unsold = await request(
      "POST",
      `/api/auction/${auctionId}/unsold`,
      {},
      AUTH
    );
    assert.equal(unsold.status, 200);
    assert.equal(unsold.body.lastUnsold.playerName, "Bumrah");

    const summary = await request("GET", `/api/auction/${auctionId}/summary`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.teams[0].totalSpent, 600);
    assert.equal(summary.body.unsold.length, 1);

    const ended = await request(
      "POST",
      `/api/auction/${auctionId}/end`,
      {},
      AUTH
    );
    assert.equal(ended.status, 200);
    assert.equal(ended.body.status, "COMPLETED");

    const exported = await request("GET", `/api/auction/${auctionId}/export`);
    assert.equal(exported.status, 200);
    assert.match(String(exported.raw || exported.body), /Virat/);
  });
});
