# Đánh giá bảo mật: publish Paseo ra Internet

Bối cảnh: `vibecode.anhnx.online` → Cloudflare Tunnel → `127.0.0.1:6767`.

## Thứ đang bị publish là gì

Không phải một web app thông thường. Paseo cho phép:

- Tạo agent chạy Claude Code / Codex / OpenCode với quyền của user `anhnx000`
- **Codex ở mode Full Access** = `approval_policy: never`, `sandbox: danger-full-access`
- Terminal trong workspace (`paseo terminal`)
- Đọc/ghi mọi file mà user đọc/ghi được — bao gồm `~/.ssh/`,
  `~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.paseo/`
- Browser tools (`daemon.browserTools.enabled: true`)

**Chiếm được phiên đăng nhập = có shell trên máy, cộng toàn bộ credentials của
các AI provider.** Đây là mức rủi ro của SSH mở ra Internet, không phải của một
trang web.

## Những gì đã làm đúng

| Biện pháp | Trạng thái | Ghi chú |
|---|---|---|
| Không mở port trên router | ✓ | tunnel là kết nối đi ra, IP nhà không lộ |
| Daemon bind `127.0.0.1` | ✓ | không nghe trên LAN |
| TLS bắt buộc | ✓ | Cloudflare terminate, client phải `ssl=true` |
| Xác thực bằng mật khẩu | ✓ | bcrypt cost 12 |
| Host allowlist | ✓ | host lạ → 403 |
| CORS allowlist | ✓ | chỉ `app.paseo.sh` và domain riêng |
| Relay của Paseo tắt | ✓ | không phụ thuộc dịch vụ hosted bên thứ ba |
| Bề mặt không cần auth | ✓ | chỉ `/api/health`, không rò gì |

Kiểm chứng:
```
GET /api/status  không auth        -> 401
GET /api/status  Bearer sai        -> 401
GET /api/status  Bearer đúng       -> 200
Host: evil.example.com             -> 403
```
`/open-project`, `/welcome`… trả 200 nhưng **md5 giống hệt `/`** — chỉ là vỏ
HTML của SPA, router chạy phía client, không chứa dữ liệu.

## Rủi ro còn lại

### 1. Mật khẩu yếu — nghiêm trọng

Đang dùng một mật khẩu 8 ký tự kiểu `Xx000000` — nằm trong mọi wordlist. Với endpoint chạy lệnh
tuỳ ý đang công khai, bot quét sẽ đoán ra. Chưa xác minh được Paseo có
rate-limit brute-force hay không.

Đây là một **mật khẩu duy nhất, không username, không 2FA**. Đoán trúng là
xong — không còn lớp nào phía sau.

### 2. Không có lớp chặn ở edge — nghiêm trọng

Hiện request vẫn **đi tới máy** rồi Paseo mới từ chối. Nghĩa là:

- Mọi lỗ hổng auth của Paseo đều khai thác được từ Internet
- Brute-force tiêu tài nguyên máy thật
- Lỗi 0-day trong tầng HTTP/WebSocket là trực tiếp tấn công được

### 3. Prompt injection — cố hữu, không vá được bằng cấu hình

Bối cảnh 2026: đã có mẫu tấn công lặp lại qua ít nhất 8 công cụ AI coding —
*nội dung không tin cậy tới tay agent → agent coi đó là chỉ thị → file config bị
sửa → safeguard bị nới → lệnh được chạy*. DuneSlide (CVE-2026-50548/50549,
CVSS 9.8) thoát sandbox terminal của Cursor với zero click. Claude Code Security
Review từng bị lừa chạy lệnh tuỳ ý và rút credentials chỉ bằng một tiêu đề PR.

Với Codex ở `danger-full-access`, một file `README` hay issue độc hại trong repo
đang mở là đủ. **Mode càng lỏng thì injection càng dễ thành RCE.**

### 4. Ba dịch vụ khác trên loopback

| Port | Dịch vụ | Auth |
|---|---|---|
| 6767 | Paseo | ✓ mật khẩu |
| 2350 | ttyd (shell trần) | ✗ **không có** |
| 2349 | opencode-web | ✗ **không có** |

Cả ba đều `127.0.0.1` nên hiện an toàn. Nhưng nếu lỡ thêm route tunnel trỏ vào
2350 thì đó là shell không mật khẩu công khai — tệ hơn mọi thứ ở trên.
**Kiểm tra ingress trên dashboard: chỉ được có đúng một route tới 6767.**

## Việc cần làm, theo thứ tự ưu tiên

### 1. Cloudflare Access — quan trọng nhất, miễn phí

dash.cloudflare.com → Zero Trust → Access → Applications → Add → Self-hosted

- Public hostname: `vibecode.anhnx.online`
- Policy: `Allow` → Include → Emails → `xuananhbka@gmail.com`
- Login: Google hoặc One-time PIN

Access mặc định **deny-by-default**: phải khớp một policy Allow mới được qua.
Người dùng xác thực với Cloudflare **trước khi ứng dụng lộ ra**, nên request
chưa đăng nhập không bao giờ tới máy. Giải quyết cùng lúc rủi ro 1 và 2 —
mật khẩu yếu không còn nguy hiểm vì bot không tới được chỗ để đoán.

### 2. Mật khẩu mạnh

```bash
paseo daemon set-password && systemctl --user restart paseo.service
```
Nếu đã có Access thì việc này bớt gấp, nhưng vẫn nên — phòng khi Access bị tắt
nhầm hoặc policy sai.

### 3. Hạ permission mode khi không cần

Dùng `auto-review` hoặc `Default Permissions` cho việc thường ngày. Chỉ bật
`full-access` khi thật sự cần, và tránh bật khi agent đang đọc nội dung từ
nguồn không tin cậy (repo lạ, issue, PR, trang web).

### 4. Giám sát

```bash
tail -f ~/.paseo/daemon.log | grep -i reject
```
Rejection dồn dập từ IP/user-agent lạ = đang bị dò. Log có sẵn `host`, `origin`,
`userAgent`, `hasToken`.

### 5. Nếu bỏ Cloudflare Access

Phương án thay thế, không phụ thuộc bên thứ ba: tắt public hostname, cài
Tailscale, cho điện thoại nối `100.x.x.x:6767`. Mất tiện lợi "mở link là vào",
đổi lại không có bề mặt công khai nào.

## Kết luận

Hạ tầng làm đúng: không mở port, TLS, có auth, host/CORS allowlist, bề mặt
không-auth tối thiểu. **Điểm yếu nằm ở chính sách, không phải kỹ thuật** — một
mật khẩu yếu là lớp phòng thủ duy nhất trước một endpoint tương đương shell.

Thêm Cloudflare Access thì tư thế bảo mật chuyển từ "một mật khẩu 8 ký tự đứng
trước RCE" sang "phải qua đăng nhập danh tính ở edge mới chạm được tới máy".
Khoảng 6 cú click, miễn phí. Nếu chỉ làm được một việc, làm việc này.

## Tham khảo

- [Publish a self-hosted application to the Internet — Cloudflare One](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare Access (ZTNA)](https://www.cloudflare.com/sase/products/access/)
- [OWASP GenAI Exploit Round-up Q1 2026](https://genai.owasp.org/2026/04/14/owasp-genai-exploit-round-up-report-q1-2026/)
- [Why Do AI Coding Agents Keep Getting the Same RCE Vulnerability?](https://appsentinels.ai/blog/why-do-ai-coding-agents-keep-getting-the-same-rce-vulnerability/)
- [AI Agent Security Risks in 2026: Prompt Injection and Tool Abuse](https://futureagi.com/blog/ai-agent-security-risks/)
