# KPL Auction Platform

Full live player auction app for KPL-style cricket tournaments.

## What it does

1. Admin creates a tournament with teams, purse budget, bid increment, and optional player roster
2. Admin runs the auction night: put players on the block, raise bids for a team, sell or mark unsold
3. Audience display shows current player, price, leading team, and remaining purses in realtime
4. Summary page shows each squad + unsold list, with CSV export

## Stack

- **Frontend:** React + Vite
- **Backend:** Express + Socket.IO + SQLite

## Screens

| Path | Purpose |
|------|---------|
| `/` | Admin console (login required) |
| `/public?auctionId=1` | Live audience / projector screen |
| `/summary?auctionId=1` | Final squads + CSV |

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

API: `http://localhost:4000`  
Default admin: `admin` / `admin123`

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App: `http://localhost:5173`

## Auction night flow

1. Login as admin
2. Create tournament (teams + budget; paste roster as `Name | Role | Base`)
3. Click **Start LIVE** and open **Live screen** on the projector
4. Click a roster player (**On block**) or use **Set now**
5. Click a team button to raise that team’s bid
6. **Sold** or **Unsold**, repeat until the roster is done
7. **End auction** → open **Summary** / download CSV

Roles: `BAT`, `BOWL`, `AR`, `WK`

## Environment

**Backend**

- `PORT` (default `4000`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- `DB_PATH` (optional SQLite file path)

**Frontend**

- `VITE_API_BASE_URL`
- `VITE_SOCKET_URL`

## Deploy notes

- Host the backend on a persistent service (Railway / Render / Fly) because Socket.IO + SQLite need a long-lived Node process
- Point Vercel frontend env vars at that API URL
- Change admin credentials before a real event
