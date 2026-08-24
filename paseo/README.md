# Paseo — điều khiển Claude Code / Codex / OpenCode từ điện thoại

Daemon chạy trên máy này, client (web / app native) kết nối vào. Agent chạy
bằng chính CLI và credentials có sẵn trên máy — Paseo không markup, không
telemetry, không bắt đăng nhập tài khoản.

Repo: https://github.com/getpaseo/paseo · AGPL-3.0

## Cài

```bash
npm install -g --allow-scripts=esbuild,node-pty @getpaseo/cli
paseo --version   # 0.5.0
```

`--allow-scripts` là bắt buộc: npm mặc định chặn install script, thiếu build
native của `node-pty` thì Paseo không spawn được terminal.

## systemd user service

`~/.config/systemd/user/paseo.service`:

```ini
[Unit]
Description=Paseo daemon (orchestrate Claude Code / OpenCode from phone)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/anhnx000
Environment=PATH=/home/anhnx000/.local/bin:/home/anhnx000/.nvm/versions/node/v24.19.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=TERM=xterm-256color
ExecStart=/home/anhnx000/.nvm/versions/node/v24.19.0/bin/paseo start --foreground --web-ui --port 6767
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now paseo.service
```

Daemon bind `127.0.0.1:6767`. Không mở ra LAN — ra ngoài đi qua Cloudflare Tunnel.

## Providers

```bash
paseo provider ls
paseo provider diagnostic codex     # chẩn đoán khi status = unavailable
paseo provider models codex
```

| Provider | Trạng thái | Modes |
|---|---|---|
| claude | available | Plan, Always Ask, Accept Edits, Auto, Bypass |
| codex | available | Default Permissions, Auto-review, **Full Access** |
| opencode | available | Build, Plan |

**Provider `unavailable` dù CLI đã cài**: daemon cache kết quả dò lúc khởi động.
`paseo reload` là xong. `paseo provider diagnostic <id>` cho biết binary có
resolve được không (`Status: Ready`).

### Permission mode của Codex

`full-access` = `approval_policy: never` + `sandbox_policy: danger-full-access`
(xác minh trong rollout log của Codex ở `~/.codex/sessions/`).

**Không đặt được làm mặc định.** Đã thử và thất bại:

| Cách | Kết quả |
|---|---|
| `providers.codex.defaultMode` | schema từ chối: `Unrecognized key: "codex"` |
| `agents.providers.codex.params.sandbox_mode` | config hợp lệ nhưng vô tác dụng — rollout vẫn `workspace-write` |

`PersistedConfigSchema` không có key nào cho default mode; mode mặc định do
`codex-app-server-agent.js` tự tính (`autoReviewEnabled ? "auto-review" : "auto"`).

Cách dùng thật:
```bash
paseo run --provider codex --mode full-access "việc cần làm"
```
Trong UI: chọn **Full Access** ở ô mode khi tạo agent.

## Publish ra Internet

Cloudflare Tunnel (token-based, ingress cấu hình trên dashboard Zero Trust):

```
vibecode.anhnx.online → Cloudflare → cloudflared → 127.0.0.1:6767
```

Cần đúng 3 thứ trong `~/.paseo/config.json`:

```json
{
  "daemon": {
    "listen": "127.0.0.1:6767",
    "hostnames": ["vibecode.anhnx.online", "localhost", "127.0.0.1"],
    "cors": { "allowedOrigins": ["https://app.paseo.sh", "https://vibecode.anhnx.online"] },
    "auth": { "password": "<bcrypt hash>" }
  }
}
```

- **`hostnames` phải là ARRAY.** CLI flag `--hostnames` nhận chuỗi comma, nhưng
  config thì `z.union([z.literal(true), z.array(z.string())])`. Đặt chuỗi
  `"a,b"` → daemon crash-loop với `daemon.hostnames: Invalid input`.
- Thiếu `hostnames` → mọi request qua domain trả **403**.
- Thiếu `allowedOrigins` → trang load được nhưng WebSocket bị chặn.

### Mật khẩu

```bash
paseo daemon set-password    # cần TTY thật, pipe stdin không lưu được
systemctl --user restart paseo.service
```

Lưu dạng bcrypt cost 12 trong `daemon.auth.password`. Cơ chế xác thực là
**Bearer token — mật khẩu chính là token**:

```bash
curl -H "Authorization: Bearer <mật khẩu>" https://vibecode.anhnx.online/api/status
```

Chỉ `/api/health` bỏ qua auth (liveness probe, chỉ trả `{"status":"ok"}`).

Đọc [security-exposure.md](security-exposure.md) trước khi publish.

## Kết nối từ thiết bị

Màn hình `/welcome` → **Direct connection**:

| Ô | Qua Internet | Trên chính máy này |
|---|---|---|
| Host | `vibecode.anhnx.online` | `127.0.0.1` |
| Port | `443` | `6767` |
| Use SSL | ☑ | ☐ |
| Password | mật khẩu daemon | mật khẩu daemon |

**Quy tắc: 443 thì luôn tích SSL, 6767 thì luôn bỏ trống.** Sai một là chết cả cặp:

1. Cloudflare chỉ nói TLS trên 443 — `ws://` vào 443 thì handshake hỏng, im lặng
2. Trang HTTPS không được mở WebSocket không mã hoá (mixed content) — trình duyệt chặn
3. Không TLS thì mật khẩu bay qua Internet dạng chữ thường

Đừng gõ `localhost` cho kết nối local: trình duyệt resolve sang IPv6 `::1`
trong khi daemon chỉ nghe IPv4 → lỗi kết nối.

**Cấu hình lưu theo từng trình duyệt (localStorage).** Điện thoại là thiết bị
mới nên phải khai báo lại từ đầu, không tự đồng bộ từ máy tính.

## Troubleshooting

```bash
systemctl --user status paseo.service
journalctl --user -u paseo.service -f
tail -f ~/.paseo/daemon.log | grep -i reject
```

Log WebSocket ghi rõ `host`, `origin`, `userAgent`, `hasToken` cho mỗi lần bị
từ chối — đủ để biết thiết bị nào gọi tới và hỏng ở đâu. **Không có dòng log
nào** nghĩa là client chưa hề chạm tới daemon (sai domain, hoặc chưa điền form).

`GitHubAuthenticationError` lặp lại trong log: chạy `gh auth login`, hoặc bỏ qua
nếu không cần trạng thái PR.

## So với `claude rc`

| | `claude rc` | Paseo |
|---|---|---|
| Cấu hình trên điện thoại | không cần gì | Host + Port + SSL + password, mỗi thiết bị một lần |
| Xác thực | tài khoản Claude trong app | mật khẩu daemon |
| Hạ tầng | Anthropic lo | tự dựng tunnel + domain |
| Agent | chỉ Claude Code | Claude Code + Codex + OpenCode |

Muốn dùng nhanh trên điện thoại thì `claude rc` ít ma sát hơn hẳn. Paseo thắng
khi cần nhiều agent và orchestration (Handoff / Advisor / Committee).

Xem thêm: [../claude-remote-control/](../claude-remote-control/)
