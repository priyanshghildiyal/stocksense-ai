
AI-powered financial research and market intelligence platform for analyzing stocks, fundamentals, technicals, news, forecasts, risks, valuations, and market trends in one intelligent workspace.

## Setup

1. Install dependencies and generate Prisma client:
   ```bash
   npm install
   ```

2. Start Postgres (and optional Redis for full caching):
   ```bash
   npm run db:up      # postgres only
   # or: docker compose --profile full up -d   # postgres + redis
   ```

3. Migrate and seed the database:
   ```bash
   npm run db:setup
   ```

4. Configure secrets in `/.env`:
   - `DATABASE_URL` — Postgres connection string (uses the Postgres image above by default)
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — minimum 32 chars each. Use a cryptographically random value (do not reuse the placeholder).
   - `OPENAI_API_KEY` — optional; enables AI research / document analysis / deep research. Leave empty if you only need market data.

5. Start the stack:
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:5173
   - API: http://localhost:4000

The API is protected: requests to authenticated endpoints need a Bearer token from `/api/auth/login` or the httpOnly cookies the server sets. See the route docs in `backend/src/routes/`.