# SSH 工具

轻量 Windows SSH 桌面客户端。远程终端(多开/切换) + SFTP 文件交互。单文件 12MB,双击即用。

## 特性

- **远程终端** — xterm.js + WebGL 渲染,256 色,中文无乱码
- **多标签** — Ctrl+T 新开、Ctrl+Shift+W 关闭,每标签独立 SSH channel
- **SFTP 文件** — 浏览/右键下载(选目录)/上传/重命名/删除/新建目录,进度条
- **复制粘贴** — 右键复制选中/粘贴,Ctrl+Shift+C/V
- **凭证加密** — Windows DPAPI 加密存储,不明文落盘
- **侧栏收起** — 终端区全屏体验
- **运行日志** — `%AppData%/ssh-tool/app.log` 全程记录

## 安装

从 [Releases](../../releases) 下载 `ssh-tool.exe`,双击运行。

## 开发

```powershell
# 前提: Go 1.22+, Node.js 18+, pnpm
go install github.com/wailsapp/wails/v2/cmd/wails@latest

cd ssh-tool
wails dev          # 热重载开发
wails build        # 打包 exe
```

前端单独构建:
```powershell
cd ssh-tool/frontend
pnpm install
pnpm run build     # tsc && vite build
```

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Wails v2 |
| 后端 | Go + golang.org/x/crypto/ssh + pkg/sftp |
| 前端 | React + TypeScript + xterm.js |
| 凭证 | Windows DPAPI(crypt32.dll) |

## License

MIT
