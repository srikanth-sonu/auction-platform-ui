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

  it("runs create → set player → bid → sell → summary → export", async () => {
    const login = await request("POST", "/api/auction/login", {
      username: "admin",
      password: "admin123",
    });
    assert.equal(login.status, 200);

    const created = await request(
      "POST",
      "/api/auction",
      {
        name: "KPL Test",
        teams: ["Alpha", "Beta"],
        budget: 10000,
        basePrice: 500,
      },
      AUTH
    );
    assert.equal(created.status, 200);
    const auctionId = created.body.auctionId;
    assert.ok(auctionId);

    const start = await request(
      "POST",
      `/api/auction/${auctionId}/start`,
      {},
      AUTH
    );
    assert.equal(start.status, 200);

    const setPlayer = await request(
      "POST",
      `/api/auction/${auctionId}/set-player`,
      { playerName: "Virat", basePrice: 500 },
      AUTH
    );
    assert.equal(setPlayer.status, 200);
    assert.equal(setPlayer.body.currentPrice, 500);

    const bid = await request(
      "POST",
      `/api/auction/${auctionId}/bid`,
      { amount: 700 },
      AUTH
    );
    assert.equal(bid.status, 200);
    assert.equal(bid.body.currentPrice, 700);

    const teams = await request("GET", `/api/auction/${auctionId}/teams`);
    assert.equal(teams.status, 200);
    const teamId = teams.body[0].id;

    const sell = await request(
      "POST",
      `/api/auction/${auctionId}/sell`,
      { teamId, playerName: "Virat", soldPrice: 700 },
      AUTH
    );
    assert.equal(sell.status, 200);
    assert.equal(sell.body.remainingBudget, 9300);

    const state = await request("GET", `/api/auction/${auctionId}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.body.currentPlayer, null);
    assert.equal(state.body.currentPrice, 0);

    const summary = await request("GET", `/api/auction/${auctionId}/summary`);
    assert.equal(summary.status, 200);
    const alpha = summary.body.find((t) => t.teamName === "Alpha");
    assert.ok(alpha);
    assert.equal(alpha.totalSpent, 700);
    assert.equal(alpha.players[0].name, "Virat");

    const exported = await request("GET", `/api/auction/${auctionId}/export`);
    assert.equal(exported.status, 200);
    assert.match(String(exported.raw || exported.body), /Virat/);
  });
});
