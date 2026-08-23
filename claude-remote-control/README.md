# Claude Code Remote Control as a systemd user service

Chạy `claude remote-control` (alias `claude rc`) nền, tự bật khi máy khởi động,
không cần mở terminal. Điều khiển từ https://claude.ai/code hoặc app Claude mobile.

## Unit file

`~/.config/systemd/user/claude-rc@.service` — templated theo đường dẫn thư mục làm việc:

```ini
[Unit]
Description=Claude Code Remote Control (%I)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/%I
Environment=PATH=/home/anhnx000/.local/bin:/home/anhnx000/.nvm/versions/node/v24.19.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=TERM=xterm-256color
ExecStart=/bin/sh -c 'exec claude remote-control --permission-mode bypassPermissions --name "$(basename "$PWD")"'
StandardOutput=null
StandardError=journal
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Lưu ý: `%I` bỏ dấu `/` đầu nên phải viết `WorkingDirectory=/%I`.
`StandardOutput=null` để TUI không vẽ lại mỗi giây làm ngập journal.

## Bật cho một thư mục

```bash
DIR=/home/anhnx000/work/linux_setups
systemctl --user enable --now "claude-rc@$(systemd-escape -p "$DIR").service"
```

Mỗi thư mục = một instance riêng, chạy song song được.

## Yêu cầu

- Đã login Claude (`claude auth`) — credentials ở `~/.claude/.credentials.json`.
- Đã chạy `claude` một lần trong thư mục đó để accept workspace trust dialog.
- Bật linger để service sống khi chưa/không login GUI:
  ```bash
  loginctl enable-linger "$USER"
  ```

## Quản lý

```bash
U="claude-rc@$(systemd-escape -p /home/anhnx000/work/linux_setups).service"
systemctl --user status  "$U"
systemctl --user restart "$U"
systemctl --user stop    "$U"
systemctl --user disable "$U"
journalctl --user -u "$U" -f
```

## Permission mode

`--permission-mode bypassPermissions` = mức cao nhất, Claude chạy mọi lệnh không hỏi,
với quyền của user đang chạy service. Tiện khi điều khiển từ điện thoại (không phải
bấm approve), nhưng nghĩa là ai vào được tài khoản Claude thì có shell trên máy này.

Các mức thấp hơn nếu muốn siết lại:

| Mode | Hành vi |
|---|---|
| `bypassPermissions` | không hỏi gì cả (đang dùng) |
| `dontAsk` | không hỏi nhưng vẫn tôn trọng `deny` rules trong settings.json |
| `acceptEdits` | tự duyệt sửa file, vẫn hỏi trước lệnh Bash lạ |
| `default` | hỏi như bình thường |

Nếu giữ `bypassPermissions`, nên bù lại bằng `deny` rules trong
`~/.claude/settings.json` cho SSH key, credentials, `sudo`.

## Giới hạn

Remote control chạy trên **máy này** — máy phải bật và có mạng. Nếu muốn dùng
khi máy đã tắt hẳn thì phải dùng cloud session (`claude --cloud "mô tả"` hoặc
tạo trên claude.ai/code), chạy trong sandbox của Anthropic và cần repo trên GitHub.
