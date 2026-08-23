# Claude Code self-host web UI (ttyd) — localhost:2350

Claude Code **không có web server built-in**. `claude rc` chỉ mở kết nối đi ra
claude.ai, không listen port nào. `--environment` là cloud session chạy trên
runner tự host, vẫn điều khiển qua claude.ai.

Muốn một trang local kiểu `localhost:2349` (opencode web) thì bọc TUI bằng
[ttyd](https://github.com/tsl0922/ttyd) — terminal trong trình duyệt, giữ
nguyên 100% tính năng vì vẫn là `claude` thật.

## Cài ttyd (không cần sudo)

```bash
curl -fsSL -o /tmp/ttyd https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64
install -m755 /tmp/ttyd ~/.local/bin/ttyd
ttyd --version   # ttyd version 1.7.7-40e79c7
```
sha256 của bản đã dùng: `8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55`

Hoặc `sudo apt install ttyd` (Ubuntu 24.04 có 1.7.4).

## Unit file

`~/.config/systemd/user/claude-web@.service`:

```ini
[Unit]
Description=Claude Code Web (ttyd) for %I
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/%I
Environment=PATH=/home/anhnx000/.local/bin:/home/anhnx000/.nvm/versions/node/v24.19.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=TERM=xterm-256color
Environment=CLAUDE_WEB_PORT=2350
ExecStart=/bin/sh -c 'exec ttyd -d 1 -p "$CLAUDE_WEB_PORT" -i 127.0.0.1 -W \
  -t fontSize=15 -t "theme={\"background\":\"#1e1e2e\"}" \
  -t titleFixed="Claude Code - $(basename "$PWD")" \
  tmux new -A -s "claude-web-$(basename "$PWD")" claude'
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Vì sao có `tmux new -A`: ttyd spawn process mới mỗi lần browser kết nối.
Bọc tmux thì F5 / đóng tab / mở lại vẫn **attach vào đúng phiên cũ**, không mất
lịch sử. Đây là điểm khác biệt chính so với chạy `ttyd claude` trần.

`-W` = writable (mặc định ttyd read-only, không gõ được).
`-d 1` = giảm log, nếu không journal sẽ ngập log mỗi request.

## Bật

```bash
DIR=/home/anhnx000/work/linux_setups
systemctl --user enable --now "claude-web@$(systemd-escape -p "$DIR").service"
```

Mở http://localhost:2350

Port 2349 đang là opencode web, 2351 cũng bận → dùng 2350. Đổi port thì sửa
`Environment=CLAUDE_WEB_PORT=`.

## Truy cập từ máy/điện thoại khác trong LAN

Mặc định bind `127.0.0.1` (chỉ máy này). Muốn mở ra LAN thì **bắt buộc đặt
mật khẩu** — đây là shell không giới hạn, mở trần ra mạng là ai cũng vào được:

```ini
ExecStart=... exec ttyd -d 1 -p "$CLAUDE_WEB_PORT" -i 0.0.0.0 -W -c user:matkhau ...
```

An toàn hơn: giữ `127.0.0.1` rồi SSH tunnel từ máy kia:
```bash
ssh -N -L 2350:127.0.0.1:2350 anhnx000@<ip-may-nay>
```

## Quản lý

```bash
U="claude-web@$(systemd-escape -p /home/anhnx000/work/linux_setups).service"
systemctl --user status "$U"
systemctl --user restart "$U"
journalctl --user -u "$U" -f
tmux ls                              # xem phiên đang sống
tmux attach -t claude-web-linux_setups   # vào cùng phiên từ terminal
```

## So sánh với remote control

| | ttyd (file này) | `claude rc` |
|---|---|---|
| Địa chỉ | http://localhost:2350 | https://claude.ai/code |
| Ra ngoài Internet | không | có |
| Dùng khi ở xa | cần VPN/SSH tunnel | vào thẳng, kể cả 4G |
| Giao diện | TUI thật trong browser | UI web/mobile riêng |
| Nhiều phiên song song | qua tmux window | có sẵn, tối đa 32 |

Hai cái chạy song song được, không đụng nhau.
