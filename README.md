# KPL Auction Platform

Professional **multi-club cricket auction** app: franchises, purses, overseas caps, roster import, live 2D/3D stage, summary + CSV.

## Why create auction was broken on Vercel

The Vercel UI was calling `https://kpl-auction-production.up.railway.app`, which returns **Application not found**. No backend = create/login fails.

### Fix (required)

1. Deploy this repo’s **API** (Docker / Render) — see below  
2. Open **https://your-vercel-app/settings**  
3. Paste the API URL → **Save & test**  
4. Login and create auctions again  

Runtime settings are stored in the browser (no rebuild needed when the API URL changes).

## Features

- Clubs + auctions
- Franchise cards (name, code, color) — not comma-separated text
- Purse, squad size, overseas quota
- Players: role, category (capped/uncapped/grades), local/overseas, base price
- Tiered bid increments
- Next / random player from roster
- Team-led bidding, sold / unsold, **undo last sale**
- CSV import + export
- Live stage with **2D / 3D** toggle + purse rail
- Polling fallback if websockets are blocked

## Local development

```bash
# API
cd backend && cp .env.example .env && npm install && npm start

# UI (another terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
```

- API: http://localhost:4000  
- UI: http://localhost:5173  
- Default admin: `admin` / `admin123`

## Production (recommended: one service)

Build UI into API and serve everything from Node (API + Socket.IO + static):

```bash
docker build -t kpl-auction .
docker run -p 4000:4000 -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me kpl-auction
```

Or use `render.yaml` for a one-click Render web service.

Then either:

- Point users at the Render URL directly, **or**
- Keep Vercel for the UI and set the Render URL in **Settings**

## Vercel UI + separate API

1. Deploy Docker/Render API  
2. In the live app open `/settings` and save the API base URL  
3. Optional: set `VITE_API_BASE_URL` in Vercel for a default (Settings can still override)

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing |
| `/settings` | Connect backend API |
| `/login` | Admin login |
| `/admin` | Full auction console |
| `/live?auctionId=1&mode=2d` | Live stage |
| `/summary?auctionId=1` | Squads + unsold + CSV |
