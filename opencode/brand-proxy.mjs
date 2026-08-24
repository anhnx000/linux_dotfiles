#!/usr/bin/env node
/**
 * Front door for the opencode web UI.
 * - Login gate: signed session cookie, login form at /__login (see auth.mjs)
 * - Proxies HTTP/SSE/WS to the upstream opencode server (which itself sits behind
 *   HTTP basic auth, injected here) so the upstream port is never usable bare
 * - Rewrites HTML title + injects CSS/JS so the visible titlebar brand becomes "Andy opencode"
 */
import http from "node:http"
import https from "node:https"
import { URL } from "node:url"
import {
  LOGIN_PATH,
  LOGOUT_PATH,
  SESSION_TTL_MS,
  STORE_FILE,
  clearFailures,
  clientIp,
  cookieHeader,
  issueToken,
  loadStore,
  lockedFor,
  loginPage,
  recordFailure,
  sessionUser,
  verifyPassword,
} from "./auth.mjs"

const UPSTREAM = process.env.OPENCODE_UPSTREAM || "http://127.0.0.1:2351"
// Loopback only. Both stacks, because browsers may resolve "localhost" to ::1.
const LISTEN_HOSTS = (process.env.BRAND_PROXY_HOST || "127.0.0.1,::1").split(",").map((h) => h.trim()).filter(Boolean)
const LISTEN_PORT = Number(process.env.BRAND_PROXY_PORT || 2349)
const BRAND = process.env.OPENCODE_BRAND || "Andy opencode"
// Host the browser must use, so page origin matches the server URL baked into
// the /server/<base64> route (keeps everything same-origin: cookies, no CORS).
const CANONICAL_HOST = process.env.OPENCODE_CANONICAL_HOST || "localhost"
const SESSION_PATH =
  process.env.OPENCODE_SESSION_PATH || "/server/aHR0cDovL2xvY2FsaG9zdDoyMzQ5/session/ses_fd790f7faffemWKvfQMgGceih9"

const upstreamUrl = new URL(UPSTREAM)
const client = upstreamUrl.protocol === "https:" ? https : http

// Basic-auth credentials for the upstream opencode server (OPENCODE_SERVER_USERNAME/PASSWORD).
const UPSTREAM_AUTH = process.env.OPENCODE_UPSTREAM_PASSWORD
  ? "Basic " +
    Buffer.from(`${process.env.OPENCODE_UPSTREAM_USER || "opencode"}:${process.env.OPENCODE_UPSTREAM_PASSWORD}`).toString(
      "base64",
    )
  : null

const store = loadStore()
if (!store) {
  console.error(`No auth store at ${STORE_FILE}. Create one:\n  node auth.mjs set-password <user> <password>`)
  process.exit(1)
}

const INJECT = `
<style id="andy-opencode-brand-css">
  /* Hide SVG wordmark "OpenCode" in titlebar / splash chrome */
  svg.wordmark,
  svg[aria-label="OpenCode"],
  [data-component="logo"],
  header svg[viewBox="0 0 234 42"],
  [data-slot="titlebar-v2"] svg[viewBox="0 0 234 42"],
  a[href="/"] svg[viewBox="0 0 234 42"] {
    display: none !important;
  }
  /* Brand label next to logo mark */
  .andy-opencode-brand {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    font-weight: 650;
    font-size: 13px;
    letter-spacing: 0.01em;
    line-height: 1;
    white-space: nowrap;
    color: var(--text-strong, var(--v2-text-text-strong, inherit));
    user-select: none;
  }
  .andy-opencode-logout {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    margin-left: 8px;
    padding: 3px 7px;
    border-radius: 5px;
    border: 1px solid var(--border, var(--v2-border-border, currentColor));
    opacity: 0.6;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .andy-opencode-logout:hover { opacity: 1; }
</style>
<script id="andy-opencode-brand-js">
(function () {
  var BRAND = ${JSON.stringify(BRAND)};
  var LOGOUT = ${JSON.stringify(LOGOUT_PATH)};
  var USER = ${JSON.stringify(store.user)};
  function setTitle() {
    try {
      var t = document.title || "";
      if (t === "OpenCode" || t === "opencode" || t.endsWith(" · OpenCode") || t.endsWith(" \\u00B7 OpenCode")) {
        document.title = t.replace(/\\s*[·\\u00B7]?\\s*OpenCode$/i, "").replace(/^OpenCode$/i, BRAND);
        if (!document.title || document.title === t) document.title = BRAND;
      } else if (!t) {
        document.title = BRAND;
      }
    } catch (e) {}
  }
  function placeBrand(root) {
    if (!root || root.querySelector(".andy-opencode-brand")) return;
    var label = document.createElement("span");
    label.className = "andy-opencode-brand";
    label.textContent = BRAND;
    label.setAttribute("data-andy-brand", "1");
    root.appendChild(label);
    var out = document.createElement("a");
    out.className = "andy-opencode-logout";
    out.href = LOGOUT;
    out.textContent = "Sign out";
    out.title = "Signed in as " + USER;
    root.appendChild(out);
  }
  function injectBrand() {
    setTitle();
    var left = document.getElementById("opencode-titlebar-left");
    if (left) placeBrand(left);
    // Home / empty states sometimes render the wordmark logo
    document.querySelectorAll('svg[aria-label="OpenCode"], svg.wordmark, svg[viewBox="0 0 234 42"]').forEach(function (svg) {
      if (svg.dataset.andyHidden) return;
      svg.dataset.andyHidden = "1";
      svg.style.display = "none";
      var parent = svg.parentElement;
      if (parent && !parent.querySelector(".andy-opencode-brand")) {
        var label = document.createElement("span");
        label.className = "andy-opencode-brand";
        label.textContent = BRAND;
        parent.insertBefore(label, svg.nextSibling);
      }
    });
  }
  var obs = new MutationObserver(function () { injectBrand(); });
  if (document.documentElement) {
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener("DOMContentLoaded", injectBrand);
  setInterval(setTitle, 1000);
  injectBrand();
})();
</script>
`

function isHtml(res, path) {
  const ct = String(res.headers["content-type"] || "")
  if (ct.includes("text/html")) return true
  // SPA fallback routes often omit content-type details
  if (!ct && (path === "/" || path.startsWith("/server/") || path.endsWith(".html"))) return true
  return false
}

function rewriteHtml(buf) {
  let html = buf.toString("utf8")
  html = html.replace(/<title>\s*OpenCode\s*<\/title>/i, `<title>${BRAND}</title>`)
  html = html.replace(/aria-label="OpenCode"/g, `aria-label="${BRAND}"`)
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${INJECT}</head>`)
  } else if (html.includes("<body")) {
    html = html.replace(/<body([^>]*)>/i, `<body$1>${INJECT}`)
  } else {
    html = INJECT + html
  }
  return Buffer.from(html, "utf8")
}

/* ------------------------------------------------------------------- login */

function sendHtml(res, status, html, extraHeaders = {}) {
  const body = Buffer.from(html, "utf8")
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store",
    ...extraHeaders,
  })
  res.end(body)
}

// Only ever redirect back to a path on this origin.
function safeNext(value) {
  const next = String(value || "")
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith(LOGIN_PATH)) return SESSION_PATH
  return next
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on("data", (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error("body too large"))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

async function handleLogin(req, res) {
  const url = new URL(req.url, `http://${CANONICAL_HOST}`)
  if (req.method === "GET") {
    sendHtml(res, 200, loginPage({ brand: BRAND, next: safeNext(url.searchParams.get("next")) }))
    return
  }
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "GET, POST" }).end()
    return
  }

  const ip = clientIp(req)
  const locked = lockedFor(ip)
  if (locked > 0) {
    sendHtml(
      res,
      429,
      loginPage({
        brand: BRAND,
        error: `Too many attempts. Try again in ${Math.ceil(locked / 1000)}s.`,
        next: SESSION_PATH,
      }),
      { "retry-after": String(Math.ceil(locked / 1000)) },
    )
    return
  }

  let form
  try {
    form = new URLSearchParams(await readBody(req))
  } catch {
    sendHtml(res, 400, loginPage({ brand: BRAND, error: "Malformed request.", next: SESSION_PATH }))
    return
  }

  const user = form.get("username") || ""
  const password = form.get("password") || ""
  const next = safeNext(form.get("next"))

  if (user !== store.user || !verifyPassword(password, store)) {
    recordFailure(ip)
    sendHtml(res, 401, loginPage({ brand: BRAND, error: "Wrong username or password.", next, user }))
    return
  }

  clearFailures(ip)
  res.writeHead(303, {
    location: next,
    "set-cookie": cookieHeader(issueToken(store), SESSION_TTL_MS),
    "cache-control": "no-store",
  })
  res.end()
}

function handleLogout(req, res) {
  res.writeHead(303, { location: LOGIN_PATH, "set-cookie": cookieHeader("", 0), "cache-control": "no-store" })
  res.end()
}

function denyUnauthenticated(req, res) {
  const accept = String(req.headers.accept || "")
  const wantsPage = req.method === "GET" && accept.includes("text/html")
  if (wantsPage) {
    res.writeHead(302, { location: `${LOGIN_PATH}?next=${encodeURIComponent(req.url || "/")}`, "cache-control": "no-store" })
    res.end()
    return
  }
  const body = Buffer.from(JSON.stringify({ error: "unauthorized", login: LOGIN_PATH }), "utf8")
  res.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store",
  })
  res.end(body)
}

/* ------------------------------------------------------------------- proxy */

function upstreamHeaders(req) {
  const headers = { ...req.headers, host: upstreamUrl.host }
  delete headers["accept-encoding"] // so we can rewrite HTML as plain text
  // Never forward the browser session cookie / client credentials upstream.
  delete headers["authorization"]
  if (UPSTREAM_AUTH) headers["authorization"] = UPSTREAM_AUTH
  return headers
}

function proxy(req, res) {
  const opts = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: upstreamHeaders(req),
  }

  const up = client.request(opts, (upRes) => {
    const path = (req.url || "/").split("?")[0]
    if (isHtml(upRes, path)) {
      const chunks = []
      upRes.on("data", (c) => chunks.push(c))
      upRes.on("end", () => {
        const body = rewriteHtml(Buffer.concat(chunks))
        const outHeaders = { ...upRes.headers }
        delete outHeaders["content-length"]
        delete outHeaders["content-encoding"]
        outHeaders["content-length"] = String(body.length)
        outHeaders["content-type"] = "text/html; charset=utf-8"
        res.writeHead(upRes.statusCode || 200, outHeaders)
        res.end(body)
      })
      return
    }
    res.writeHead(upRes.statusCode || 200, upRes.headers)
    upRes.pipe(res)
  })

  up.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
    res.end(`Brand proxy cannot reach upstream ${UPSTREAM}: ${err.message}`)
  })

  req.pipe(up)
}

function handleRequest(req, res) {
  // Keep one origin so the session cookie and the /server/<base64> route agree.
  const hostHeader = String(req.headers.host || "")
  const hostName = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]")) // [::1]:2349
    : hostHeader.split(":")[0]
  if (hostName && hostName !== CANONICAL_HOST && /^(127\.0\.0\.1|::1|0\.0\.0\.0)$/.test(hostName)) {
    res.writeHead(302, { location: `http://${CANONICAL_HOST}:${LISTEN_PORT}${req.url || "/"}` })
    res.end()
    return
  }

  const path = (req.url || "/").split("?")[0]
  if (path === LOGIN_PATH) {
    handleLogin(req, res).catch(() => {
      if (!res.headersSent) sendHtml(res, 500, loginPage({ brand: BRAND, error: "Server error.", next: SESSION_PATH }))
    })
    return
  }
  if (path === LOGOUT_PATH) return handleLogout(req, res)
  if (!sessionUser(req, store)) return denyUnauthenticated(req, res)
  proxy(req, res)
}

function handleUpgrade(req, socket, head) {
  if (!sessionUser(req, store)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")
    socket.destroy()
    return
  }
  const opts = {
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
    path: req.url,
    method: "GET",
    headers: upstreamHeaders(req),
  }
  const up = client.request(opts)
  up.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        `\r\n\r\n`,
    )
    if (upHead?.length) socket.write(upHead)
    upSocket.pipe(socket)
    socket.pipe(upSocket)
  })
  up.on("error", () => socket.destroy())
  up.end()
  if (head?.length) up.write(head)
}

const base = `http://${CANONICAL_HOST}:${LISTEN_PORT}`
console.log(`Andy opencode web proxy`)
console.log(`  UI:       ${base}${SESSION_PATH}`)
console.log(`  login:    ${base}${LOGIN_PATH}  (user: ${store.user})`)
console.log(`  upstream: ${UPSTREAM}${UPSTREAM_AUTH ? " (basic auth)" : " (UNSECURED)"}`)
console.log(`  brand:    ${BRAND}`)

for (const host of LISTEN_HOSTS) {
  const server = http.createServer(handleRequest)
  server.on("upgrade", handleUpgrade)
  server.on("error", (err) => {
    // A loopback family the machine does not have is fine; anything else is fatal.
    if (["EADDRNOTAVAIL", "EAFNOSUPPORT", "EINVAL"].includes(err.code)) {
      console.warn(`  skip ${host}: ${err.code}`)
      return
    }
    console.error(`  listen ${host}:${LISTEN_PORT} failed: ${err.message}`)
    process.exit(1)
  })
  server.listen(LISTEN_PORT, host, () => console.log(`  listening on ${host}:${LISTEN_PORT}`))
}
