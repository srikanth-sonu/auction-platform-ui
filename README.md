# KPL Auction Platform

Realtime cricket-style player auction for KPL tournaments.

## Stack

- **Frontend:** React + Vite (admin console, public live screen, team summary)
- **Backend:** Express + Socket.IO + SQLite

## Features

- Admin login (default `admin` / `admin123`)
- Create tournaments with teams and purse budgets
- Live bidding with socket updates to a public display
- Sell / unsold player flow with remaining budget tracking
- Team summary + CSV export

## Quick start

### Backend

```bash
cd backend
cp .env.example .env   # optional; defaults work locally
npm install
npm start
```

API runs at `http://localhost:4000`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App runs at `http://localhost:5173`.

### Screens

| Path | Purpose |
|------|---------|
| `/` | Admin panel |
| `/public?auctionId=1` | Live audience display |
| `/summary?auctionId=1` | Team results + CSV |

## Environment

**Backend**

- `PORT` (default `4000`)
- `ADMIN_USERNAME` (default `admin`)
- `ADMIN_PASSWORD` (default `admin123`)

**Frontend**

- `VITE_API_BASE_URL` – REST API base URL
- `VITE_SOCKET_URL` – Socket.IO server URL (falls back to API base)
