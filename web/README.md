# K-Town Defense web

The web application runs as a long-lived Node server. Production traffic enters
through Caddy, while server-side routes call FastAPI over the private Docker
network. Browsers never receive the database URL, API container address, OAuth
client secrets, or session signing secret.

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 3000
```

The root route always uses the integrated FastAPI service. Use `/demo` for
isolated UI-only work. `KTOWN_DEV_USER_ID` is accepted only outside production.

## Standalone production

```powershell
npm run build:server
npm start
```

The production container uses the same commands. Configure at least
`KTOWN_API_BASE_URL`, `KTOWN_SESSION_SECRET`, and one social OAuth provider.
OAuth callbacks use `https://<domain>/api/auth/<provider>/callback`.

The territory map draws itself from this repository's own boundary data
(`public/data`), so it needs no map provider, key, or network tiles. A browser
without WebGL gets the territory list the map sits above.
