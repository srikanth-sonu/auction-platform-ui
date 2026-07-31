try {
  require("dotenv").config();
} catch {
  // optional
}

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

require("./db");

const auctionRoutes = require("./routes/auctionRoutes");
const auctionSocket = require("./socket/auctionSocket");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "DELETE", "OPTIONS"] },
});

app.set("io", io);
app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "username", "password"],
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "KPL Auction Backend" });
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "KPL Auction Backend" });
});

app.use("/api/auction", auctionRoutes);

const frontendDist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/)(?!\/socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  auctionSocket(io, socket);
  socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
