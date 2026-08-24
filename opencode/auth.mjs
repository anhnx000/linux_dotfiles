#!/usr/bin/env node
/**
 * Auth layer for the Andy opencode web proxy.
 *
 * - Credentials live in a 0600 store (`.run/auth.json`): username + scrypt(salt, hash)
 *   + an HMAC secret used to sign session cookies. No plaintext password on disk.
 * - Successful login issues a signed cookie `andy_sid` (user + expiry + HMAC).
 * - Failed logins are rate limited per client IP.
 *
 * CLI:
 *   node auth.mjs set-password <user> [password]   # password from stdin if omitted
 *   node auth.mjs ensure <user> <password>         # create store only if missing
 *   node auth.mjs whoami
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const STORE_FILE = process.env.OPENCODE_AUTH_STORE || path.join(HERE, ".run", "auth.json")

export const COOKIE_NAME = "andy_sid"
export const SESSION_TTL_MS = Number(process.env.OPENCODE_AUTH_TTL_HOURS || 12) * 60 * 60 * 1000
export const LOGIN_PATH = "/__login"
export const LOGOUT_PATH = "/__logout"

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 }

/* ---------------------------------------------------------------- password */

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString("hex")
  return { salt, hash }
}

export function verifyPassword(password, store) {
  if (!store?.salt || !store?.hash) return false
  let candidate
  try {
    candidate = crypto.scryptSync(password, store.salt, SCRYPT.keylen, SCRYPT)
  } catch {
    return false
  }
  const expected = Buffer.from(store.hash, "hex")
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

function safeEqualStr(a, b) {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  if (A.length !== B.length) return false
  return crypto.timingSafeEqual(A, B)
}

/* ------------------------------------------------------------------- store */

export function loadStore(file = STORE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}

export function saveStore(store, file = STORE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 })
  fs.chmodSync(tmp, 0o600)
  fs.renameSync(tmp, file)
  return store
}

export function setPassword(user, password, file = STORE_FILE) {
  if (!user) throw new Error("username required")
  if (!password) throw new Error("password required")
  const prev = loadStore(file)
  const { salt, hash } = hashPassword(password)
  return saveStore(
    {
      user,
      salt,
      hash,
      // Rotating the secret on password change invalidates existing sessions.
      secret: crypto.randomBytes(32).toString("hex"),
      updated: new Date().toISOString(),
      created: prev?.created || new Date().toISOString(),
    },
    file,
  )
}

/* ---------------------------------------------------------------- sessions */

function sign(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url")
}

export function issueToken(store, ttlMs = SESSION_TTL_MS) {
  const payload = `${Buffer.from(store.user, "utf8").toString("base64url")}.${Date.now() + ttlMs}`
  return `${payload}.${sign(store.secret, payload)}`
}

export function verifyToken(store, token) {
  if (!store?.secret || typeof token !== "string") return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [user64, exp, mac] = parts
  if (!safeEqualStr(mac, sign(store.secret, `${user64}.${exp}`))) return null
  if (!Number(exp) || Number(exp) < Date.now()) return null
  const user = Buffer.from(user64, "base64url").toString("utf8")
  return user === store.user ? user : null
}

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionUser(req, store) {
  return verifyToken(store, parseCookies(req.headers.cookie)[COOKIE_NAME])
}

export function cookieHeader(token, ttlMs = SESSION_TTL_MS) {
  const bits = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"]
  bits.push(token ? `Max-Age=${Math.floor(ttlMs / 1000)}` : "Max-Age=0")
  return bits.join("; ")
}

/* ------------------------------------------------------------ rate limiting */

const FAIL_WINDOW_MS = 10 * 60 * 1000
const FAIL_LIMIT = 8
const LOCK_MS = 5 * 60 * 1000
const failures = new Map()

export function clientIp(req) {
  return req.socket?.remoteAddress || "unknown"
}

export function lockedFor(ip) {
  const rec = failures.get(ip)
  if (!rec?.until) return 0
  const left = rec.until - Date.now()
  if (left <= 0) {
    failures.delete(ip)
    return 0
  }
  return left
}

export function recordFailure(ip) {
  const now = Date.now()
  const rec = failures.get(ip)
  if (!rec || now - rec.first > FAIL_WINDOW_MS) {
    failures.set(ip, { count: 1, first: now, until: 0 })
    return
  }
  rec.count += 1
  if (rec.count >= FAIL_LIMIT) {
    rec.until = now + LOCK_MS
    rec.count = 0
    rec.first = now
  }
}

export function clearFailures(ip) {
  failures.delete(ip)
}

/* ---------------------------------------------------------------- login UI */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

export function loginPage({ brand = "Andy opencode", error = "", next = "/", user = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · ${esc(brand)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f6f5; --card: #ffffff; --line: #e2e2df; --text: #1b1b19;
    --muted: #6d6d68; --accent: #d97757; --accent-text: #ffffff; --err-bg: #fdeceb; --err-text: #a2331f;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17170f; --card: #201f1a; --line: #34332c; --text: #f0efe6;
      --muted: #9a998e; --accent: #d97757; --accent-text: #1b1b19; --err-bg: #3a2019; --err-text: #f2b3a3;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: var(--bg); color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line);
    border-radius: 12px; padding: 28px 26px 24px; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06);
  }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 650; letter-spacing: .01em; }
  p.sub { margin: 0 0 20px; font-size: 13px; color: var(--muted); }
  label { display: block; font-size: 12px; font-weight: 600; margin: 14px 0 6px; color: var(--muted); }
  input[type=text], input[type=password] {
    width: 100%; padding: 9px 11px; font-size: 14px; color: var(--text); background: var(--bg);
    border: 1px solid var(--line); border-radius: 7px; font-family: inherit;
  }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
  button {
    width: 100%; margin-top: 20px; padding: 10px 12px; font-size: 14px; font-weight: 650; font-family: inherit;
    color: var(--accent-text); background: var(--accent); border: 0; border-radius: 7px; cursor: pointer;
  }
  button:hover { filter: brightness(1.05); }
  .error {
    margin: 0 0 4px; padding: 9px 11px; font-size: 13px; border-radius: 7px;
    background: var(--err-bg); color: var(--err-text);
  }
  .foot { margin: 18px 0 0; font-size: 11px; color: var(--muted); text-align: center; }
</style>
</head>
<body>
  <form class="card" method="POST" action="${esc(LOGIN_PATH)}" autocomplete="on">
    <h1>${esc(brand)}</h1>
    <p class="sub">Sign in to continue</p>
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="username">Username</label>
    <input id="username" name="username" type="text" value="${esc(user)}" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
    <p class="foot">Local session · ${Math.round(SESSION_TTL_MS / 3600000)}h</p>
  </form>
</body>
</html>
`
}

/* --------------------------------------------------------------------- CLI */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2)
  if (cmd === "set-password") {
    const user = args[0]
    const pass = args[1] ?? fs.readFileSync(0, "utf8").trim()
    setPassword(user, pass)
    console.log(`auth: password set for "${user}" (${STORE_FILE})`)
  } else if (cmd === "ensure") {
    const [user, pass] = args
    if (loadStore()) {
      console.log(`auth: store already exists (${STORE_FILE})`)
    } else {
      setPassword(user, pass)
      console.log(`auth: created store for "${user}" (${STORE_FILE})`)
    }
  } else if (cmd === "whoami") {
    const s = loadStore()
    console.log(s ? `${s.user} (updated ${s.updated})` : "no auth store")
  } else {
    console.error("usage: node auth.mjs set-password <user> [password] | ensure <user> <password> | whoami")
    process.exit(1)
  }
}
