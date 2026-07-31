try {
  require("dotenv").config();
} catch {
  // optional in production when env vars are injected
}

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
  cors: {
    origin: "*",
  },
});

app.set("io", io);

app.use(cors());
app.use(express.json());

app.use("/api/auction", auctionRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "KPL Auction Backend" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  auctionSocket(io, socket);

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
