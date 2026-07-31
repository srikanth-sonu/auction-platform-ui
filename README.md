# KPL Auction Platform

Modern **2D / 3D switchable** live player auction for cricket tournaments.

## Experience

- Brand landing page
- Admin console with sidebar sections
- **Team cards** — add teams one-by-one (type + Enter), not comma-separated text
- Player roster with roles (`BAT` / `BOWL` / `AR` / `WK`)
- Live bidding with team-led raises, sold / unsold
- **Live stage** with a **2D ↔ 3D** toggle (Three.js auction floor + floating board)
- Squad summary + CSV export

## Screens

| Route | Purpose |
|------|---------|
| `/` | Landing |
| `/login` | Admin login |
| `/admin` | Full auction console |
| `/live?auctionId=1&mode=3d` | Live stage (2D or 3D) |
| `/public?auctionId=1` | Alias of live (old links) |
| `/summary?auctionId=1` | Squads + unsold + CSV |

## Quick start

```bash
# API
cd backend && cp .env.example .env && npm install && npm start

# UI
cd frontend && cp .env.example .env && npm install && npm run dev
```

- API: `http://localhost:4000`
- App: `http://localhost:5173`
- Default admin: `admin` / `admin123`

## Auction night

1. Admin → **Create** → add team cards + optional roster  
2. **Control** → Start LIVE → open Live stage (pick 2D or 3D)  
3. **Roster** → put a player on the block  
4. **Bidding** → tap a team to raise → Sold / Unsold  
5. End auction → Summary / CSV  

## Env

**Backend:** `PORT`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, optional `DB_PATH`  
**Frontend:** `VITE_API_BASE_URL`, `VITE_SOCKET_URL`
