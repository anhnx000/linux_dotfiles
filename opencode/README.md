# Andy opencode (web)

Local recipe: run the opencode web UI for this folder, open the saved session, and show **Andy opencode** in the titlebar / browser tab instead of `OpenCode`.

## Files

| File | Purpose |
|------|---------|
| `opencode.jsonc` | Project config (`server.port` 2349, CORS for brand proxy) |
| `start-web.sh` | Starts `opencode web` + brand proxy; `stop` to tear down |
| `brand-proxy.mjs` | Reverse proxy on **2350** that rewrites title / injects brand |
| `session-ses_fd790f7faffemWKvfQMgGceih9.json` | Export of the session from the original URL |

Original session URL:

```
http://localhost:2349/server/aHR0cDovL2xvY2FsaG9zdDoyMzQ5/session/ses_fd790f7faffemWKvfQMgGceih9
```

## Run

```bash
bash start-web.sh
```

Open (proxy — branded titlebar):

```
http://127.0.0.1:2350/server/aHR0cDovL2xvY2FsaG9zdDoyMzQ5/session/ses_fd790f7faffemWKvfQMgGceih9
```

Stop:

```bash
bash start-web.sh stop
```

## Notes

- Brand text defaults to `Andy opencode` (`OPENCODE_BRAND` to override).
- Upstream stays on port **2349**; branded UI is on **2350**.
- Session data lives in the global opencode DB; the JSON export is a portable backup (`opencode import session-….json` if needed).
- Requires `opencode` on `PATH` and Node.js for the proxy.
