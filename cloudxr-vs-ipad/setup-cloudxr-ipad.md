# NVIDIA CloudXR cho laptop hiện tại (Linux + RTX 5060) và iPad

Tài liệu này được chỉnh để **phù hợp máy đang dùng Linux** trong repo này, đồng thời vẫn giữ đường triển khai chuẩn để stream sang iPad.

---

## 1) Chọn đúng hướng triển khai

Trên laptop hiện tại có 2 hướng:

- **Hướng A (khuyến nghị, ổn định nhất):** chạy CloudXR Server theo pipeline NVIDIA trên **Windows 11** (dual-boot hoặc máy Windows khác), sau đó kết nối iPad.
- **Hướng B (Linux):** chỉ dùng khi bạn có gói CloudXR/OpenXR phù hợp cho Linux từ NVIDIA; hướng này mang tính kỹ thuật nâng cao và không tương đương đầy đủ pipeline SteamVR trên Windows.

Nếu mục tiêu của bạn là “laptop RTX 5060 stream sang iPad nhanh và ít lỗi”, hãy đi theo **Hướng A**.

---

## 2) Trạng thái laptop hiện tại và việc cần làm trước

Máy này là Linux; GPU NVIDIA đã thấy qua `lspci`. Để dùng GPU ổn định cho workload XR, cần xác nhận driver đầy đủ:

```bash
lspci | grep -i nvidia
command -v nvidia-smi || echo "nvidia-smi chưa sẵn sàng"
nvidia-smi
```

Nếu `nvidia-smi` chưa chạy được, cài proprietary driver trước (tùy distro). Với distro họ Debian/Ubuntu, bạn có thể bắt đầu như sau:

```bash
sudo apt update
sudo ubuntu-drivers autoinstall
sudo reboot
nvidia-smi
```

Lưu ý: tên gói/luồng cài driver có thể khác theo distro và kernel.

---

## 3) Hướng A - CloudXR Server trên Windows (đề xuất cho laptop này)

### Yêu cầu

- Windows 10/11 64-bit (khuyến nghị Windows 11).
- RTX 5060 (đáp ứng NVENC).
- NVIDIA driver mới (tối thiểu theo yêu cầu phiên bản CloudXR bạn dùng, thường >= 552.74).
- Steam + SteamVR (nếu pipeline VR yêu cầu).
- Mạng LAN/Wi-Fi 5 GHz hoặc 6 GHz, ổn định.

### Cài đặt

1. Cập nhật driver NVIDIA trên Windows.
2. Vào [NGC](https://ngc.nvidia.com), tải CloudXR Runtime/SDK đúng phiên bản.
3. Chạy installer và chọn thành phần CloudXR Server.
4. Cài Steam + SteamVR.
5. Mở firewall ports cần thiết:
   - TCP `48010`
   - UDP `47998`, `47999`, `48000`, `48002`, `48005`

### Kết nối iPad

1. Trên Windows, mở SteamVR (nếu cần) và chạy CloudXR service.
2. Trên iPad, mở app CloudXR client.
3. Nhập IP LAN của laptop Windows (ví dụ `192.168.1.x`) rồi `Connect`.

---

## 4) Hướng B - Linux OpenXR (nâng cao, không phải đường đơn giản nhất)

Hướng này chỉ phù hợp khi bạn đã có artifact CloudXR runtime hỗ trợ Linux từ NVIDIA.

Thiết lập OpenXR runtime:

```bash
export XR_RUNTIME_JSON=/path/to/cloudxr-runtime/openxr_cloudxr.json
mkdir -p ~/.config/openxr/1
ln -sf /path/to/cloudxr-runtime/openxr_cloudxr.json ~/.config/openxr/1/active_runtime.json
```

Kiểm tra:

```bash
echo "$XR_RUNTIME_JSON"
ls -l ~/.config/openxr/1/active_runtime.json
```

Giới hạn thực tế: hướng Linux OpenXR không thay thế trực tiếp toàn bộ workflow SteamVR CloudXR server Windows cho iPad generic viewer trong mọi trường hợp.

---

## 5) Cài CloudXR client trên iPad

### Cách 1 - Generic Viewer (nhanh nhất cho dev)

- Repo: [cloudxr-apple-generic-viewer](https://github.com/NVIDIA/cloudxr-apple-generic-viewer)
- Build bằng Xcode trên Mac và cài lên iPad.

### Cách 2 - Tích hợp framework vào app riêng

- Repo: [cloudxr-framework](https://github.com/NVIDIA/cloudxr-framework)
- Dùng cho visionOS/iOS/iPadOS theo SDK của NVIDIA.

---

## 6) Ghi lại video từ iPad

- Ghi trực tiếp trên iPad: bật `Screen Recording` trong Control Center.
- Ghi phía server: OBS/ShadowPlay.
- Nếu có Mac: dùng QuickTime với iPad cắm cáp.

---

## 7) Workflow khuyến nghị cho laptop này

```text
Laptop hiện tại (Linux + RTX 5060)
  └── Dùng để chuẩn bị tài liệu, driver, test môi trường
      (hoặc dual-boot sang Windows để chạy CloudXR Server)
            │
            ▼
Windows 11 + CloudXR Server (+ SteamVR nếu cần)
            │ LAN/Wi-Fi 5/6 GHz
            ▼
iPad CloudXR Client
```

---

## Liên kết nhanh

| Nội dung | URL |
|----------|-----|
| NGC | https://ngc.nvidia.com |
| Tài liệu CloudXR SDK | https://docs.nvidia.com/cloudxr-sdk/latest/index.html |
| Driver NVIDIA | https://www.nvidia.com/Download/index.aspx |
| Steam | https://store.steampowered.com |
| Generic Viewer (Apple) | https://github.com/NVIDIA/cloudxr-apple-generic-viewer |
| CloudXR Framework | https://github.com/NVIDIA/cloudxr-framework |

---

Tóm lại: với laptop này, cách thực tế nhất để stream CloudXR sang iPad là chạy server trên Windows (dual-boot hoặc máy Windows), còn Linux giữ vai trò chuẩn bị môi trường hoặc dùng cho luồng OpenXR nâng cao.
