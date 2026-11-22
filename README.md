# SSH 工具

轻量 SSH 桌面客户端（Windows / Linux）。远程终端（多开/切换）+ SFTP 文件交互。单二进制 ~12MB，双击即用。

## 特性

- **远程终端** — xterm.js + WebGL 渲染，256 色，中文无乱码；PTY 输出按 10ms 窗口合并推送，高频输出下输入依旧跟手
- **多标签 / 会话侧栏** — 每标签独立 SSH channel，Ctrl+T 新开、Ctrl+Shift+W 关闭，切标签不丢滚动历史
- **SFTP 文件树** — 浏览/下载/上传/重命名/删除/新建目录/新建文件，进度条；拖放上传（Wails OnFileDrop）
- **内置文本编辑器** — 直接编辑远程文件，Ctrl+S 保存
- **设置中心** — 终端字体/字号、窗口样式（自绘/系统标题栏）、服务器信息管理；字体支持在线下载（JetBrains Mono / Fira Code）
- **复制粘贴** — 右键复制选中/粘贴，Ctrl+Shift+C/V
- **凭证加密** — Windows DPAPI / Linux Secret Service（GNOME Keyring），不明文落盘；凭证替换/删除自动清理
- **运行日志** — `%AppData%/ssh-tool/app.log`（Linux: `~/.config/ssh-tool/`）全程记录

## 下载

从 [Releases](../../releases) 下载：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `ssh-tool.exe` | Windows 10/11 x64，需 WebView2（系统通常自带），双击运行 |
| Linux | `ssh-tool_*.deb` | Ubuntu 24.04+，`apt install ./ssh-tool_*.deb` 自动带上 GTK3/WebKitGTK 运行库 |
| Linux | `ssh-tool-linux` | 裸二进制，需自备 GTK3 + WebKitGTK 4.1 |

推送 `v*` tag 时 CI 自动构建双平台产物并上传 Release。

## 开发

前提：Go 1.25+、Node.js 18+、pnpm ≥9、[Wails CLI v2.12.0](https://wails.io)（与 go.mod 一致）。

```powershell
# Windows
cd ssh-tool
wails dev          # 热重载开发
wails build        # 打包 exe
```

```bash
# Linux（Ubuntu 22.04/24.04，需 libgtk-3-dev libwebkit2gtk-4.1-dev）
cd ssh-tool
wails dev -tags webkit2_41     # Ubuntu 22.04/24.04 只有 WebKitGTK 4.1，tag 不可省
wails build -tags webkit2_41

# 前端单独构建（两端通用）
cd ssh-tool/frontend
CI=true pnpm install --frozen-lockfile
pnpm run build                 # tsc && vite build
```

WSL2 里可交叉编译 Windows exe：`wails build -platform windows/amd64 -s -skipbindings`（无需 mingw）。

容器化可复现环境（Ubuntu 24.04 + GTK3/WebKitGTK，GUI 直通）与 `.deb` 打包脚本见 `ssh-tool/build/linux/`。

## CI

GitHub Actions 双平台矩阵构建（`windows-latest` 原生 / `ubuntu-latest` + WebKitGTK 4.1）：
前端构建 → `go vet` → `wails build`，push 到 `master`/`windows-port`/`linux-port` 或 PR 触发；产物上传 artifact。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Wails v2 |
| 后端 | Go + golang.org/x/crypto/ssh + pkg/sftp |
| 前端 | React + TypeScript + xterm.js + WebGL |
| 凭证 | Windows DPAPI（crypt32.dll）/ Linux Secret Service（go-keyring） |

## 目录结构

```
ssh-tool/
  main.go               # Wails 入口（平台拆分后双平台单工程）
  app/
    ssh.go              # SSH 连接/PTY（10ms 合并推流）
    sftp.go             # SFTP 列目录/上传/下载（进度节流）
    vault_windows.go    # Windows DPAPI
    vault_linux.go      # Linux Secret Service
    settings.go         # 用户设置（字体/窗口样式）
    font.go             # 字体在线下载
    store.go            # 连接配置 JSON 持久化
  frontend/src/
    App.tsx             # 主布局：会话侧栏 + 终端 + 文件树
    views/              # SessionList/FileTree/SettingsDialog/TitleBar/Terminal/...
  build/linux/          # 容器化开发环境 + .deb 打包脚本
docs/                  # Linux 移植执行计划与环境记录
```

## License

MIT
