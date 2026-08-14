#!/usr/bin/env bash
# Cài "Open in Warp" vào menu chuột phải của Nautilus (GNOME).
#
#   ./install.sh            -> cài Nautilus script (Scripts > Open in Warp), KHÔNG cần sudo
#   ./install.sh --extension-> cài thêm extension (dòng "Open in Warp" ở cấp đầu, cần sudo)
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WITH_EXT=0
[ "${1:-}" = "--extension" ] && WITH_EXT=1

# --- kiểm tra điều kiện -----------------------------------------------------
command -v nautilus >/dev/null || { echo "Không tìm thấy nautilus. Script này chỉ dùng cho GNOME/Nautilus."; exit 1; }
command -v warp-terminal >/dev/null || { echo "Không tìm thấy warp-terminal. Cài Warp trước: https://www.warp.dev/download"; exit 1; }

# --- 1. Nautilus script -----------------------------------------------------
SCRIPTS_DIR="$HOME/.local/share/nautilus/scripts"
mkdir -p "$SCRIPTS_DIR"
install -m 755 "$HERE/files/Open in Warp" "$SCRIPTS_DIR/Open in Warp"
echo "[ok] $SCRIPTS_DIR/Open in Warp"

# --- 2. Extension (tuỳ chọn) ------------------------------------------------
if [ "$WITH_EXT" = 1 ]; then
    if ! dpkg -s python3-nautilus >/dev/null 2>&1; then
        echo "[..] Cài gói python3-nautilus (cần sudo)"
        sudo apt-get update -qq
        sudo apt-get install -y python3-nautilus
    fi
    EXT_DIR="$HOME/.local/share/nautilus-python/extensions"
    mkdir -p "$EXT_DIR"
    install -m 644 "$HERE/files/open-in-warp.py" "$EXT_DIR/open-in-warp.py"
    echo "[ok] $EXT_DIR/open-in-warp.py"
fi

# --- 3. Restart Nautilus ----------------------------------------------------
nautilus -q >/dev/null 2>&1 || true
echo
echo "Xong. Chuột phải trong folder:"
echo "  - Scripts > Open in Warp"
if [ "$WITH_EXT" = 1 ]; then
    echo "  - Open in Warp   (dòng riêng ở cấp đầu)"
fi
