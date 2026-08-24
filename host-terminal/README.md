# Host Terminal Web (ttyd) — localhost:2352, có mật khẩu

Terminal của **máy chính (host)** trong trình duyệt. Mở web → hộp thoại đăng
nhập → vào thẳng shell chạy dưới user `anhnx000` (KHÔNG phải trong Docker).

Khác `claude-web@` ở thư mục `../claude-remote-control`: cái đó chạy `claude`,
cái này là shell trần của máy — làm được mọi thứ như terminal thật.

## Đăng nhập

Dùng basic auth của ttyd (nhập sai → 401, không vào được). **Mật khẩu KHÔNG
nằm trong repo** (repo này public) — nó đọc từ `~/.config/host-terminal.env`:

```bash
install -m600 host-terminal.env.example ~/.config/host-terminal.env
# sửa HOST_TERM_CRED=user:password trong file đó
systemctl --user restart host-terminal.service
```

Service load secret qua `EnvironmentFile=-%h/.config/host-terminal.env`, ghi đè
placeholder `user:CHANGE_ME` trong unit file. File `.env` đã được `.gitignore`.

## Cài

Chạy dưới **systemd --user** nên terminal là user `anhnx000` của máy host,
không cần root, không cô lập.

```bash
install -m644 host-terminal.service ~/.config/systemd/user/host-terminal.service
systemctl --user daemon-reload
systemctl --user enable --now host-terminal.service
```

Mở http://localhost:2352

Bọc `tmux new -A -s host-term`: đóng tab / F5 / mở lại vẫn attach đúng phiên cũ,
không mất lịch sử.

## Đổi cấu hình

Sửa các `Environment=` trong `host-terminal.service` rồi
`systemctl --user daemon-reload && systemctl --user restart host-terminal.service`:

- `HOST_TERM_CRED` — user/mật khẩu, đặt trong `~/.config/host-terminal.env`
  (định dạng `user:password`), KHÔNG sửa trong unit file để tránh commit lộ.
- `HOST_TERM_PORT=2352` — đổi port (2349 opencode, 2350 claude-web, 2351 bận).
- `HOST_TERM_BIND=127.0.0.1` — chỉ máy này. Đổi `0.0.0.0` để mở ra LAN /
  Cloudflare Tunnel.

## ⚠️ Bảo mật

Đây là shell không giới hạn của máy host. Mật khẩu `1` chỉ an toàn khi bind
`127.0.0.1`. Trước khi mở `0.0.0.0` hoặc đưa qua Cloudflare Tunnel ra Internet,
**đổi sang mật khẩu mạnh** trong `HOST_TERM_CRED`. An toàn hơn là giữ
`127.0.0.1` rồi SSH tunnel từ máy khác:

```bash
ssh -N -L 2352:127.0.0.1:2352 anhnx000@<ip-may-nay>
```

## Quản lý

```bash
systemctl --user status host-terminal.service
systemctl --user restart host-terminal.service
journalctl --user -u host-terminal.service -f
tmux attach -t host-term        # vào cùng phiên từ terminal thật
```
