# SSH工具 — Agent 指南

## 项目

个人使用的轻量 SSH 桌面客户端。远程终端(多开/切换)+ SFTP 文件交互。单二进制,原生窗口。

## 技术栈

- **桌面壳**: Wails v2(Go 后端 + 系统 WebView 前端,单二进制 ~12MB)
- **后端**: Go 1.22+
  - SSH: `golang.org/x/crypto/ssh`(官方库)
  - SFTP: `github.com/pkg/sftp`
  - 凭证加密: Windows DPAPI(`github.com/go-ole/go-ole`)
- **前端**: Vite + React + TypeScript(在 `frontend/`,pnpm 管理)
  - 终端: `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl`
- **包管理**: 前端 pnpm,后端 Go modules

## 开发命令

```powershell
cd ssh-tool
wails dev      # 热重载开发(同时跑 Go 后端 + Vite 前端,弹原生窗口)
wails build -s -skipbindings  # 产出 build/bin/ssh-tool.exe(已预 build 前端,跳过 install)
cd frontend; pnpm install   # 单独装前端依赖
cd frontend; pnpm run build # 单独构建前端(需先 tsc --noEmit 通过)
```

> pnpm 11 会拦截 esbuild 构建脚本导致 `wails build` 失败。已用 `frontend/pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 配置。若仍失败,用 `wails build -s` 跳过前端重建(前端 dist 已预 build)。

## 架构

工程根在 `ssh-tool/`(非仓库根):
```
ssh-tool/
  main.go              # Wails 应用入口,绑定 App,注入事件推送
  app/
    app.go             # App 结构 + 会话/连接配置 CRUD + Session/Terminal 类型
    ssh.go             # SSH 连接(密码/密钥) + PTY(StdinPipe/StdoutPipe) + keepalive
    sftp.go            # SFTP 列目录/上传/下载(惰性开启)
    vault.go           # DPAPI 加解密(syscall 调 crypt32.dll,非 COM)
    store.go           # 连接配置 JSON 持久化(%AppData%/ssh-tool/)
  frontend/src/
    App.tsx            # 主布局:左栏 + 右侧标签/面板切换
    hooks/useSSH.ts    # 会话/标签/连接状态管理
    views/
      Terminal.tsx       # xterm.js + FitAddon + WebglAddon + 事件桥接
      TerminalTabs.tsx   # 多标签(Ctrl+T/Ctrl+W)
      FilePanel.tsx      # SFTP 浏览/拖拽上传/下载
      ConnectionList.tsx # 左侧连接列表
      ConnectDialog.tsx  # 新建/编辑连接对话框
```

## 关键约定

- **终端多开**: 每个标签页一个独立 SSH channel,互不干扰。Ctrl+T 新开,Ctrl+W 关闭。
- **PTY 必须**: shell channel 须请求 `pty-req`,否则 vim/htop/tmux 不可用。
- **凭证不落明文**: 主机/端口/用户名可明文 JSON,密码/密钥须 DPAPI 加密。
- **keepalive**: 15-30s 心跳,断线自动重连。
- **前后端通信**: Wails 通过绑定方法(Go → 前端可调)和事件(后端 → 前端推流)通信。终端 PTY 输出走事件流推到 xterm.js。

## 遵循全局规范

见 `~/.config/opencode/AGENTS.md`:类型安全(无 `any`/`ts-ignore`)、最小改动、错误不吞、lint→test→build、未经要求不提交 git、不建 README。
