# Front + Airtable Riders Plugin

A **Front** sidebar plugin that reads the conversation’s email, looks up **Riders** in your **Airtable** base by that email, and shows **ID_RIDER** and **Associated tour** for each match.

## Architecture

- **Plugin** (React + Vite + Front Plugin SDK): runs in Front’s sidebar, gets the current conversation’s email, calls your backend, and displays Riders (ID_RIDER, Associated tour).
- **Backend** (Node + Express): holds your Airtable API key, and queries the Riders table by email via the Airtable API.

## Prerequisites

- Node.js 18+
- A Front account (admin to create the plugin)
- An Airtable base with a **Riders** table that has:
  - A field for **email** (e.g. `Email`) to search by
  - **ID_RIDER** (or `id_rider`)
  - **Associated tour** (linked record or text)

---

## 1. Airtable setup

1. Create a [Personal Access Token](https://airtable.com/create/tokens) (or use an API key) with scopes: `data.records:read` (and `schema.bases:read` if you use table name).
2. Note your **Base ID** from the base URL: `https://airtable.com/appXXXXXXXXXXXXXX/...` → `appXXXXXXXXXXXXXX`.
3. In the Riders table, ensure you have:
   - A field used for email lookup (e.g. `Email`) — set `AIRTABLE_EMAIL_FIELD` to match.
   - Fields **ID_RIDER** and **Associated tour** (name must match; “Associated tour” can be a linked record).

---

## 2. Backend

1. **Install and configure**

   ```bash
   cd backend
   cp .env.example .env
   ```

   Edit `.env`:

   - `AIRTABLE_API_KEY` — your Airtable Personal Access Token (or API key)
   - `AIRTABLE_BASE_ID` — base ID (e.g. `appXXXXXXXXXXXXXX`)
   - Optional: `AIRTABLE_RIDERS_TABLE=Riders`, `AIRTABLE_EMAIL_FIELD=Email`

2. **Run**

   ```bash
   npm install
   npm run dev
   ```

   Backend runs at `http://localhost:4000`:

   - `GET /api/riders?email=...` — returns Airtable records from the Riders table matching that email.
   - `GET /health` — health check.

---

## 3. Front plugin

1. **Install and run**

   ```bash
   cd plugin
   npm install
   npm run dev
   ```

   Plugin runs at `http://localhost:3000`.

2. **Optional:** Point to a different backend:

   ```bash
   cp .env.example .env
   # Set VITE_API_URL=https://your-backend.example.com
   ```

3. **Register in Front**

   - Front → **Settings** → **Company** → **Developers** → create an app → add **Sidebar Plugin**.
   - Set **Side panel URL** to `http://localhost:3000` (dev) or your deployed plugin URL.
   - Pin the plugin and open a conversation; the plugin shows the conversation email and a “Search Riders in Airtable” button. Results show **ID_RIDER** and **Associated tour** for each Rider.

---

## 4. Deploy (easiest & cheapest)

**Yes, Vercel works** — for the **plugin**. The backend is a long‑running Node server (and saves visa uploads to disk), so it fits better on **Railway** or **Render**. Both have free tiers.

### Plugin on Vercel (free)

1. Push your repo to GitHub (if you haven’t).
2. In [Vercel](https://vercel.com): **Add New** → **Project** → import the repo.
3. Set **Root Directory** to `plugin` (or deploy from a repo that only contains the plugin).
4. Vercel will use the plugin’s `package.json` and `vite build`. No extra config needed (there’s a `plugin/vercel.json` if you want to be explicit).
5. Add an **Environment Variable**: `VITE_API_URL` = your backend URL (e.g. `https://your-backend.railway.app`). Redeploy after adding it.
6. After deploy, copy the project URL (e.g. `https://your-plugin.vercel.app`) and set it as the **Side panel URL** in Front (Settings → your app → Sidebar Plugin).

### Backend on Railway (free tier, ~$5 credit/month)

1. Go to [Railway](https://railway.app) and sign in (e.g. with GitHub).
2. **New Project** → **Deploy from GitHub** → select the repo.
3. Set **Root Directory** to `backend` (or add a `railway.json` / **Start Command** to `npm start` and **Build Command** to nothing or `npm install`).
4. In the service **Variables**, add your `.env` values:
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `PUBLIC_URL` = the Railway URL for this service (e.g. `https://your-app.railway.app`). Set it after the first deploy when Railway gives you the URL.
5. Deploy. Railway will run `npm start` (from `backend/package.json`). Use the generated URL as `PUBLIC_URL` and as `VITE_API_URL` in the Vercel plugin.

### Alternative: Backend on Render (free tier)

1. [Render](https://render.com) → **New** → **Web Service** → connect repo.
2. **Root Directory**: `backend`. **Build**: `npm install`. **Start**: `npm start`.
3. Add env vars (same as above, and set `PUBLIC_URL` to the Render URL after deploy).

### Summary

| Part    | Where   | Cost   |
|---------|---------|--------|
| Plugin  | Vercel  | Free   |
| Backend | Railway or Render | Free tier |

Vercel can’t run the backend as a classic “always-on” server with persistent disk, so visa uploads are best kept on Railway/Render. If you later want everything on Vercel, the backend would need to be refactored to serverless + external file storage (e.g. Vercel Blob).

---

## 5. Production checklist

- **Backend:** Set `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `PUBLIC_URL` (and optional table/field names). Restrict CORS to your plugin origin if desired.
- **Plugin:** Set `VITE_API_URL` to your backend URL and rebuild/redeploy. Set Front’s Side panel URL to your plugin URL.

---

## Field names

- **ID_RIDER** — exact field name in Airtable (or `id_rider`; the plugin checks both).
- **Associated tour** — exact field name; if it’s a linked record, the plugin shows the linked record name(s) when Airtable returns them in the field value.

If your Airtable uses different names (e.g. `ID Rider` or `Tour`), update the `RiderCard` component in `plugin/src/components/RidersPanel.jsx` to read from `fields['Your Field Name']`.
