#!/usr/bin/env bash
# 构建 ssh-tool 的 Ubuntu 24.04 amd64 .deb 安装包。
# 前置: wails build -tags webkit2_41 生成 build/bin/ssh-tool。
set -euo pipefail

cd "$(dirname "$0")/../.."

PKG="ssh-tool"
VERSION="${SSH_TOOL_DEB_VERSION:-0.1.0}"
ARCH=amd64
OUT="build/deb"
STAGE="$OUT/stage/${PKG}_${VERSION}_${ARCH}"
DEB="$OUT/${PKG}_${VERSION}_${ARCH}.deb"

if [ ! -x build/bin/ssh-tool ]; then
  echo "缺少 build/bin/ssh-tool, 请先执行: wails build -tags webkit2_41" >&2
  exit 1
fi

rm -rf "$OUT/stage"
mkdir -p \
  "$STAGE/DEBIAN" \
  "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" \
  "$STAGE/usr/share/doc/$PKG" \
  "$STAGE/usr/share/fonts/truetype/ssh-tool"

install -m 0755 build/bin/ssh-tool "$STAGE/usr/bin/ssh-tool"

if [ -d build/linux/fonts ]; then
  install -m 0644 build/linux/fonts/*.ttf "$STAGE/usr/share/fonts/truetype/ssh-tool/"
  if [ -f build/linux/fonts/JetBrainsMono-OFL.txt ]; then
    install -m 0644 build/linux/fonts/JetBrainsMono-OFL.txt "$STAGE/usr/share/doc/$PKG/"
  fi
fi

# appicon.png(1024x1024) 缩放到 hicolor 标准尺寸
python3 - "$STAGE" <<'PYEOF'
import os, sys
import gi
gi.require_version('GdkPixbuf', '2.0')
from gi.repository import GdkPixbuf

stage = sys.argv[1]
for size in (512, 256, 128, 64, 48, 32, 16):
    d = os.path.join(stage, 'usr', 'share', 'icons', 'hicolor', f'{size}x{size}', 'apps')
    os.makedirs(d, exist_ok=True)
    pb = GdkPixbuf.Pixbuf.new_from_file_at_scale('build/appicon.png', size, size, True)
    pb.savev(os.path.join(d, 'ssh-tool.png'), 'png', [], [])
print('icons: 512/256/128/64/48/32/16 ok')
PYEOF

cat > "$STAGE/usr/share/applications/ssh-tool.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=SSH 工具
Name[zh_CN]=SSH 工具
Comment=轻量 SSH 桌面客户端（远程终端 + SFTP）
Comment[zh_CN]=轻量 SSH 桌面客户端（远程终端 + SFTP）
Exec=ssh-tool
Icon=ssh-tool
Terminal=false
Categories=Network;Utility;
StartupWMClass=ssh-tool
EOF

cat > "$STAGE/usr/share/doc/$PKG/copyright" <<'EOF'
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: ssh-tool
License: MIT

Files: usr/share/fonts/truetype/ssh-tool/*
Copyright: 2020 The JetBrains Mono Project Authors
License: SIL-OFL-1.1
  本包附带的 JetBrains Mono 字体按 SIL Open Font License 1.1 分发,
  许可全文见同目录 JetBrainsMono-OFL.txt。
EOF

# dpkg-shlibdeps 需要 debian/control 上下文, 依赖按已装 shlibs 精确计算
WORK="$OUT/shlibdeps"
rm -rf "$WORK"
mkdir -p "$WORK/debian"
printf 'Source: %s\nSection: net\nPriority: optional\nMaintainer: yumo <2584114945@qq.com>\n\nPackage: %s\nArchitecture: %s\nDepends: ${shlibs:Depends}\nDescription: probe\n' "$PKG" "$PKG" "$ARCH" > "$WORK/debian/control"
DEPENDS="$(cd "$WORK" && dpkg-shlibdeps -O "$OLDPWD/$STAGE/usr/bin/ssh-tool" 2>/dev/null | sed 's/^shlibs:Depends=//')"
echo "Depends: $DEPENDS"

cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Maintainer: yumo <2584114945@qq.com>
Depends: $DEPENDS
Description: 轻量 SSH 桌面客户端（远程终端 + SFTP）
 基于 Wails/Go/React 的 SSH 桌面客户端：多标签远程终端与 SFTP 文件交互。
EOF

dpkg-deb --build --root-owner-group "$STAGE" "$DEB"

( cd "$OUT" && sha256sum "${PKG}_${VERSION}_${ARCH}.deb" > SHA256SUMS )

{
  echo "package: ${PKG}_${VERSION}_${ARCH}.deb"
  echo "built-at: $(date -Is)"
  echo "host: $(. /etc/os-release && echo "$PRETTY_NAME") $(uname -m)"
  echo "binary: build/bin/ssh-tool ($(stat -c %s build/bin/ssh-tool) bytes, wails build -tags webkit2_41)"
  echo "dpkg-deb: $(dpkg-deb --version | head -1)"
} > "$OUT/BUILDINFO.txt"

echo '=== 安装包信息 ==='
dpkg-deb -I "$DEB"
echo '=== 内容清单 ==='
dpkg-deb -c "$DEB"
echo '=== 校验值 ==='
cat "$OUT/SHA256SUMS"
