# StockSense frontend

This workspace is a React/Vite frontend. It does not contain a market-data provider, backend, credentials, or bundled securities. It will display quotes only after its configured server-side API returns validated, timestamped records.

## Connect a market-data provider

1. Select a provider for the exchanges and asset classes you need. Confirm real-time versus delayed coverage, exchange entitlements, storage limits, display/redistribution rights, and rate limits.
2. Implement a server-side adapter that authenticates with the provider, normalizes its responses, and serves the schema below. Keep API keys and provider credentials on the server; never put them in `VITE_*` variables, frontend source, or browser storage.
3. Make the endpoint available to this app at `/api/market/securities` (same origin is simplest), or set `VITE_MARKET_API_URL` to a public, authorized backend URL. For cross-origin APIs, configure CORS and implement an explicit authentication strategy; the frontend does not send cross-origin cookies or provider credentials.
4. Optionally set `VITE_MARKET_POLL_MS` to a refresh interval in milliseconds. The browser clamps it to 15–300 seconds, polls the endpoint, and provides a manual **Refresh data** control. This is polling, not a guaranteed exchange-real-time feed; use a provider-supported streaming service and a server-side WebSocket/SSE gateway if lower latency is required.
5. Deploy the frontend and API over HTTPS. Apply authorization, per-user entitlements, rate limiting, validation, monitoring, and provider licensing restrictions at the API boundary.

### Required response contract

Return JSON with an ISO-8601 `updatedAt`, a provider/source label, and a `securities` array (up to 1,000 records):

```json
{
  "source": "Your licensed provider",
  "updatedAt": "2025-01-15T10:30:00.000Z",
  "securities": [
    {
      "ticker": "EXAMPLE",
      "name": "Example Company",
      "exchange": "EXCH",
      "sector": "Technology",
      "assetType": "Equity",
      "price": 123.45,
      "changePercent": 1.25,
      "currency": "INR",
      "asOf": "2025-01-15T10:29:58.000Z",
      "source": "Your licensed provider"
    }
  ]
}
```

`price` and `changePercent` must be finite numbers; `price` cannot be negative. `currency` must be a three-letter ISO 4217 code. Each quote must include its own timestamp. Duplicate or malformed tickers, malformed rows, invalid JSON, and responses larger than 2 MB are rejected rather than partially displayed. The frontend marks data older than five minutes as stale; that threshold is a warning, not a guarantee of freshness or proof that a feed is real-time.

## Data coverage and limitations

The current endpoint supplies security quotes only. It does not provide index history, chart series, fundamentals, news, portfolio history, alerts, or AI research. Those features need separately licensed provider endpoints and their own schema, timestamps, provenance, and server-side access controls. A quote is not sufficient evidence for company analysis. Authentication in the sign-in screen is also not connected.

No live provider or backend can be configured from the frontend alone. The browser UI will remain in its offline state until an API implementing this contract is available.
