
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

## Production deployment

The repository includes a production Docker stack:

```bash
cp .env.example .env
# Set strong production secrets and your public frontend origin.
docker compose -f docker-compose.production.yml up -d --build
```

The frontend is exposed on the configured `PORT` (default `8080`). Nginx serves the SPA and proxies `/api/*` to the backend. PostgreSQL is kept on the internal Docker network and persisted in a named volume.

### Required production variables

- `DATABASE_URL`
- `POSTGRES_USER` / `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — use independent, cryptographically random values of at least 32 characters
- `CORS_ORIGIN` — the exact public frontend origin
- `TRUST_PROXY` — set to the number of trusted reverse-proxy hops (normally `1` behind one ingress)
- `OPENAI_API_KEY` — optional; AI research remains explicitly unavailable when unset

Never commit `.env` or production secrets.

### CI

GitHub Actions runs dependency installation, Prisma generation, backend typechecking/building, frontend production build, and a dependency audit on pushes and pull requests.

### Data-provider note

StockSense currently uses `yahoo-finance2` through the backend provider layer. It is an unofficial Yahoo Finance client, so provider availability and upstream behavior are not guaranteed. For a commercial production deployment, keep the provider behind the existing adapter and plan a supported/licensed market-data provider with explicit SLAs and redistribution rights.
