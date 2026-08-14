# Open in Warp — menu chuột phải cho Nautilus (GNOME)

Thêm dòng **Open in Warp** vào menu chuột phải trong file manager, để mở Warp Terminal
ngay tại thư mục đang đứng.

Tham khảo ý tưởng: <https://github.com/hexplor/open-in-warp>
(README gốc dùng `warp-terminal --directory "$DIR"` — **flag này không còn tồn tại** trên
bản Warp mới, xem phần [Ghi chú](#ghi-chú-về-warp---directory) ở cuối.)

Đã test trên: Ubuntu 24.04, GNOME Nautilus 46.4, Warp Terminal (bản .deb chính thức).

---

## Có 2 cách, chọn 1 (hoặc cài cả 2)

| | Cách A — Nautilus script | Cách B — Nautilus extension |
|---|---|---|
| Vị trí trong menu | Chuột phải → **Scripts** → *Open in Warp* | Chuột phải → **Open in Warp** (cấp đầu) |
| Cần `sudo` | Không | Có (`python3-nautilus`) |
| Chuột phải vào nền folder | Được | Được |
| Chuột phải vào 1 folder cụ thể | Được | Được |

Khuyến nghị: cài cả 2 bằng `./install.sh --extension`.

---

## Cài nhanh (dùng script có sẵn)

```bash
git clone <repo-của-bạn> ~/work/linux_setups   # hoặc copy thư mục này sang máy mới
cd ~/work/linux_setups/open-in-warp-setup

chmod +x install.sh

./install.sh               # chỉ cách A (không cần sudo)
# hoặc
./install.sh --extension   # cách A + cách B
```

Sau khi chạy xong, mở Nautilus và chuột phải trong 1 folder bất kỳ.

---

## Cài thủ công (nếu muốn hiểu từng bước)

### Yêu cầu

```bash
command -v nautilus        # phải có -> GNOME
command -v warp-terminal   # phải có -> chưa có thì tải ở https://www.warp.dev/download
```

### Cách A — Nautilus script (không cần sudo)

```bash
mkdir -p ~/.local/share/nautilus/scripts
cp "files/Open in Warp" ~/.local/share/nautilus/scripts/
chmod +x ~/.local/share/nautilus/scripts/"Open in Warp"
nautilus -q          # restart Nautilus để nó nạp lại
```

> Tên file chính là chữ hiện trong menu. Muốn đổi thành `Mở bằng Warp` thì đổi tên file.

Nội dung `files/Open in Warp`:

```bash
#!/bin/bash
# Mở Warp Terminal tại thư mục đang chọn (hoặc thư mục hiện tại trong Nautilus)

# Nếu right-click vào 1 folder -> dùng folder đó
if [ -n "$1" ] && [ -d "$1" ]; then
    DIR="$(realpath "$1")"
else
    # Ngược lại dùng thư mục Nautilus đang mở (URI -> path, giải mã %20 ...)
    DIR="$(printf '%b' "${NAUTILUS_SCRIPT_CURRENT_URI#file://}" | sed 's/%\(..\)/\\x\1/g' | xargs -0 printf '%b' 2>/dev/null)"
    [ -d "$DIR" ] || DIR="$PWD"
fi

cd "$DIR" || exit 1

if pgrep -x warp >/dev/null 2>&1 || pgrep -x warp-terminal >/dev/null 2>&1; then
    # Warp đang chạy -> dùng deep link để mở cửa sổ mới đúng thư mục
    setsid warp-terminal "warp://action/new_window?path=$DIR" >/dev/null 2>&1 &
else
    setsid warp-terminal >/dev/null 2>&1 &
fi
```

Giải thích vài chỗ:

- Nautilus truyền tên các item đang chọn qua `$1, $2, ...`, và thư mục đang mở qua biến
  môi trường `NAUTILUS_SCRIPT_CURRENT_URI` (dạng `file:///home/...`, có URL-encode).
- `pgrep -x warp` bắt tiến trình `/opt/warpdotdev/warp-terminal/warp` khi Warp đã chạy.
  Warp là single-instance, nên lần thứ 2 trở đi phải dùng deep link `warp://action/new_window?path=`
  thì mới mở đúng thư mục.
- `setsid ... &` để Warp không bị kill khi Nautilus đóng script.

### Cách B — Nautilus extension (dòng riêng ở cấp đầu, cần sudo)

```bash
sudo apt install -y python3-nautilus

mkdir -p ~/.local/share/nautilus-python/extensions
cp files/open-in-warp.py ~/.local/share/nautilus-python/extensions/
nautilus -q
```

File `files/open-in-warp.py` implement `Nautilus.MenuProvider` với 2 hook:

- `get_file_items()` — khi chuột phải **vào** 1 folder (chọn file thì lấy folder cha).
- `get_background_items()` — khi chuột phải vào **nền trống** của folder đang mở.

---

## Kiểm tra / gỡ lỗi

```bash
# chạy tay xem có mở Warp không
bash ~/.local/share/nautilus/scripts/"Open in Warp" /home/$USER/work

# extension có được nạp không (xem log Nautilus)
nautilus -q && nautilus 2>&1 | grep -i -E "warp|nautilus-python"
```

Menu không hiện:

- Chưa `chmod +x` file script → Nautilus bỏ qua.
- Chưa `nautilus -q` sau khi copy file.
- Với cách B: thiếu `python3-nautilus`, hoặc file `.py` có lỗi cú pháp (Nautilus im lặng bỏ qua).

Warp mở nhưng **sai thư mục**: bản Warp của bạn có thể chưa hỗ trợ deep link
`warp://action/new_window`. Sửa script, bỏ nhánh `if` đi và chỉ để:

```bash
cd "$DIR" || exit 1
setsid warp-terminal >/dev/null 2>&1 &
```

---

## Gỡ cài đặt

```bash
rm -f ~/.local/share/nautilus/scripts/"Open in Warp"
rm -f ~/.local/share/nautilus-python/extensions/open-in-warp.py
nautilus -q
```

---

## Ghi chú về Warp `--directory`

README của `hexplor/open-in-warp` dùng:

```bash
warp-terminal --directory "$DIR"
```

Trên bản Warp hiện tại (kiểm tra bằng `warp-terminal --help`) **không còn** flag này —
CLI giờ chỉ có các subcommand `agent / mcp / run / login / ...` và các option
`--api-key`, `--output-format`, `--debug`, `--crash-recovery-mechanism`.
Vì vậy script ở đây dùng `cd` + deep link `warp://` thay thế.

Trước khi copy sang máy mới, chạy lại `warp-terminal --help` để xem bản Warp ở đó có gì khác.
