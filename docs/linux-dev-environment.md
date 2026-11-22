# Linux 开发环境记录（阶段 0）

- 记录日期：2026-11-11
- 复核日期：2026-11-11（复核结论见 4.1）
- 更新日期：2026-11-12（计划阶段 1–3 完成，构建阻塞解除，见 4.3）
- 对应计划：[linux-port-execution-plan.md](./linux-port-execution-plan.md) 阶段 0
- 结论：**Linux 开发环境两条路径均可用**。
  1. **宿主机原生**：已安装 gcc/build-essential、pkg-config、GTK3 dev 与 WebKitGTK 4.1 dev，CGO 编译、`wails doctor`、`go build`、`wails build`/`wails dev`（`-tags webkit2_41`）均可在宿主机直接执行；
  2. **容器化**：`ssh-tool-dev:noble` 提供可复现的干净构建环境，用于 CI/干净环境验证与 GUI 直通测试。
  两条路径共用同一工程目录与缓存/依赖，可交替使用（切换时需注意 `node_modules` 归属，见第 2 节）。应用完整构建已通过（计划阶段 1–3 完成，见 4.3）。

## 1. 宿主机环境

| 项目 | 值 |
| --- | --- |
| 发行版 | Ubuntu 24.04.5 LTS (noble) |
| 内核 | 7.0.0-42-generic |
| 架构 | x86_64 |
| 显示会话 | Wayland（`wayland-0`），同时存在 XWayland（`DISPLAY=:0`） |
| CPU / 内存 | AMD Ryzen 7 4800H / 15 GB |
| Docker | 29.1.3（可正常拉取镜像） |

### 1.1 权限与职责边界

搭建初期宿主机没有 root 权限（`sudo -n` 需要密码），无法通过 apt 安装 CGO/GTK/WebKit 开发包，因此当时把构建链路放进了容器。**后续宿主机已具备系统开发包**，原生构建路径恢复可用。

当前职责：

- **宿主机**：日常开发默认路径。可执行 `pnpm install/build`、`go build`、`wails dev`/`wails build -tags webkit2_41`，窗口直接使用当前 Wayland/XWayland 会话；
- **容器**：保留为可复现/干净构建路径，用于验证「从零环境可构建」、`wails doctor`、GUI 直通测试，以及避免宿主机环境差异。

宿主机 `wails doctor` 仍会提示 `libwebkit Not Found`（Wails v2.12.0 检查的是 `webkit2gtk-4.0`，24.04 只有 4.1），属已知误报，见 4.2；以 `pkg-config --modversion webkit2gtk-4.1` 和实际构建为准。

## 2. 宿主机工具链与系统开发包

### 2.1 工具链

| 工具 | 版本 | 位置 |
| --- | --- | --- |
| Go | 1.25.14 | `~/.local/opt/go/bin/go` |
| Wails CLI | v2.12.0 | `~/.local/bin/wails` |
| Node.js | v24.22.2 | `~/.nvm/versions/node/v24.22.2/bin`（原有） |
| npm | 11.19.1 | 随 Node 提供 |
| pnpm | 10.34.9 | `~/.local/bin/pnpm` |
| Docker | 29.1.3 | 系统包 |

### 2.2 系统开发包（2026-11-11 追加安装）

| 包 | 版本 | 用途 |
| --- | --- | --- |
| build-essential / gcc | 12.10ubuntu1 / gcc 13.3.0 | CGO 编译 |
| libgtk-3-dev | 3.24.41-4ubuntu1.3 | Wails Linux UI |
| libwebkit2gtk-4.1-dev | 2.52.6-0ubuntu0.24.04.1 | WebKitGTK，构建需 `-tags webkit2_41` |
| pkg-config | 1.8.1-2build1 | 库探测 |

这些包使宿主机具备与容器等价的原生构建能力，容器内不再必需（但仍保留用于可复现验证）。

配置改动：

- `~/.profile`、`~/.bashrc` 增加 `~/.local/opt/go/bin` 到 `PATH`。
- 两个文件均设置 `GOPROXY=https://goproxy.cn,direct`；当前网络下 `proxy.golang.org` 不可达。
- pnpm 由 **8.15.9 升级到 10.34.9**：`frontend/pnpm-lock.yaml` 为 `lockfileVersion: '9.0'`，且 `pnpm-workspace.yaml` 使用 pnpm 9+ 的 `onlyBuiltDependencies` 格式，pnpm 8 直接报 `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION`。

> 注意：`frontend/node_modules` 被宿主机与容器共用，`node_modules/.modules.yaml` 的 `storeDir` 跟随最后执行安装的一方（宿主机为 `~/.local/share/pnpm/store/v10`，容器为 `/workspace/.pnpm-store/v10`）。在另一侧首次安装时 pnpm 会要求重建 `node_modules`：容器脚本已注入 `CI=true` 自动处理，宿主机侧建议显式执行 `CI=true pnpm install --frozen-lockfile`，否则非 TTY 下报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。`pnpm run build` 不受影响。

### 2.3 宿主机原生命令

在 `ssh-tool-linux/` 目录执行（Linux 移植工程，改动统一在该目录；无需容器）：

```bash
cd frontend && CI=true pnpm install --frozen-lockfile   # 仅在 node_modules 归属容器时需要 rebuild
cd frontend && pnpm run build                           # tsc && vite build
go build ./...                                          # 已通过（阶段 1–3 完成）
wails doctor                                            # libwebkit 误报见 4.2
wails build -tags webkit2_41                            # 已通过，产出 build/bin/ssh-tool
wails dev -tags webkit2_41                              # 可直接启动原生窗口
```

## 3. 容器化开发环境（可复现构建路径）

文件：

| 文件 | 用途 |
| --- | --- |
| `build/linux/Dockerfile.dev` | 固定版本的 Ubuntu 24.04 构建镜像 |
| `build/linux/dev-env.sh` | 镜像构建与容器开发命令入口 |

镜像 `ssh-tool-dev:noble`（复核时 ID `87d29de6b993`，创建于 2026-11-11 16:28，`docker image ls` 显示 3.19 GB，Ubuntu 24.04 基础镜像）：

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| gcc / build-essential | 13.3.0 | CGO 编译 |
| GTK3 dev | 3.24.41 | Wails Linux UI |
| WebKitGTK 4.1 dev | 2.52.6 | 24.04 唯一可用版本，需 `-tags webkit2_41` |
| pkg-config | 1.8.1 | 库探测 |
| Go | 1.25.14 | 满足 `go.mod` 的 `go 1.25.0` |
| Node.js / npm / pnpm | 24.22.2 / 11.19.1 / 10.34.9 | 与宿主机一致 |
| Wails CLI | v2.12.0 | 与 `go.mod` 依赖版本一致 |
| 其他 | make、git、curl、字体 Noto CJK、Mesa DRI | 构建与 GUI 运行 |
| 凭证开发（阶段 2） | gnome-keyring 46.1、libsecret-tools 0.21.4、dbus-x11 | Secret Service 测试环境 |

其他设计：

- 容器内用户 `dev`，UID/GID 取构建时的 `id -u`/`id -g`（本机 1000/1000），保证 bind mount 文件权限正常。
- 镜像保留 `/var/lib/apt/lists`：`wails doctor` 通过 `apt list` 判断依赖，删除列表会导致已安装包被误报为未安装。
- APT 使用清华镜像（实测约 622 KB/s，阿里云镜像约 195 KB/s），Node 与 Go 使用阿里云镜像，Go modules 使用 `goproxy.cn`。
- `docker run` 使用 `--network host`，容器内 Vite dev server 端口（默认 5173）在宿主机 `127.0.0.1` 可直接访问。

### 3.1 容器命令

在 `ssh-tool-linux/` 目录执行；以下命令把对应的开发动作放在容器内完成（宿主机原生命令见 2.3）：

```bash
build/linux/dev-env.sh up       # 启动常驻开发容器 ssh-tool-dev（已存在则复用；镜像/挂载变化时自动重建）
build/linux/dev-env.sh exec -- <命令>   # 在常驻容器内执行命令（管道/脚本方式）
build/linux/dev-env.sh down     # 停止并删除常驻容器（项目与缓存均在宿主挂载上，不会丢失）
docker exec -it ssh-tool-dev bash       # 在常驻容器内开交互 shell

build/linux/dev-env.sh image    # 构建/更新镜像（更新后再次 up 会自动用新镜像重建容器）
build/linux/dev-env.sh doctor   # 一次性容器内 wails doctor（libwebkit 误报见 4.2）
build/linux/dev-env.sh shell    # 一次性交互 shell（--rm，退出即销毁）
build/linux/dev-env.sh run -- <命令>   # 在一次性容器的 /workspace 执行任意命令

# 前端依赖安装 + 类型检查 + Vite 构建（容器内）
build/linux/dev-env.sh run -- bash -c \
  'cd /workspace/frontend && pnpm install --frozen-lockfile && pnpm run build'

# 独立 Vite dev server（容器内起服务，宿主机浏览器可访问 127.0.0.1:5173）
build/linux/dev-env.sh run -- bash -c \
  'cd /workspace/frontend && ./node_modules/.bin/vite --host 0.0.0.0 --port 5173'

# Go 包编译（已通过）
build/linux/dev-env.sh run -- go build ./...

build/linux/dev-env.sh build    # wails build -tags webkit2_41
build/linux/dev-env.sh dev      # wails dev -tags webkit2_41（含 Vite HMR + GUI 窗口）
```

常驻容器与一次性容器共用同一镜像、项目挂载和 Go/pnpm 缓存；两者不要同时执行 `pnpm install`/`wails build`，避免共享 `node_modules` 与缓存竞争。常驻容器的 `DISPLAY`、`WAYLAND_DISPLAY`、`XAUTHORITY` 在创建时注入，宿主重新登录或更换显示会话后执行 `down` 再 `up` 以刷新挂载。

脚本默认注入：

- 项目目录挂载到 `/workspace`；
- Go 模块/构建缓存挂载到 `~/.cache/ssh-tool-dev/go`；
- `CI=true`（容器内 pnpm store 与宿主机不同，需允许非交互重建 `node_modules`）；
- `DISPLAY`、`XAUTHORITY`、`/tmp/.X11-unix`、Wayland socket、`/dev/dri`（存在时）直通，用于 GUI 测试；
- `CGO_ENABLED=1`、`GOPROXY`。

可用 `SSH_TOOL_DEV_IMAGE`、`SSH_TOOL_WAILS_TAGS`、`SSH_TOOL_DEV_CACHE` 覆盖默认值。

### 3.2 GUI 直通

- Wayland：脚本挂载宿主 `$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY` 到容器并设置 `XDG_RUNTIME_DIR`，GTK 默认选 Wayland；
- X11/XWayland：挂载 `/tmp/.X11-unix` 与 `XAUTHORITY` 文件，可用 `GDK_BACKEND=x11` 强制验证；
- 有 `/dev/dri` 时直通 GPU（WebGL 用），无则回退软件渲染。

## 4. 验证结果

以下为 2026-11-11 复核时在本机重新执行的结果（命令均从 `ssh-tool/` 目录发起）：

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 宿主机工具链版本 | 通过 | Go 1.25.14、Wails v2.12.0、Node v24.22.2、npm 11.19.1、pnpm 10.34.9，与记录一致 |
| 宿主机系统开发包 | 通过 | build-essential 12.10（gcc 13.3.0）、libgtk-3-dev 3.24.41、libwebkit2gtk-4.1-dev 2.52.6、pkg-config 1.8.1 |
| `wails doctor`（宿主机） | 通过（libwebkit 误报） | gcc/build-essential、libgtk-3-dev、npm、pkg-config 均 Installed；libwebkit 误报见 4.2 |
| CGO + GTK/WebKit 冒烟（宿主机） | 通过 | 原生编译、链接并运行探针：`GTK 3.24.41`、`WebKitGTK 2.52.6`；`ldd` 确认三个动态库 |
| 宿主机 GUI | 通过 | GTK 探针：Wayland `backend=wayland-0`、`GDK_BACKEND=x11` 时 `backend=:0` |
| 宿主机 `pnpm install --frozen-lockfile` | 通过 | `CI=true` 856 ms，`.modules.yaml` 的 `storeDir` 恢复为宿主 store |
| 宿主机 `pnpm run build` | 通过 | `tsc` 无错误；Vite 55 modules，生成 `dist/` |
| 宿主机 `go build ./...` | 失败（预期） | 与容器一致：`vault.go:11`、`14` 共 2 处 `undefined: syscall.NewLazyDLL` |
| 宿主机 `wails build -tags webkit2_41` | 失败（预期） | 生成绑定阶段报同一 vault.go 错误，未出现依赖缺失 |
| 镜像 `ssh-tool-dev:noble` | 通过 | ID `87d29de6b993`，创建于 2026-11-11 16:28，3.19 GB |
| 常驻开发容器 `up`/`exec` | 通过 | `ssh-tool-dev` 启动成功；容器内 `id`=1000、`/workspace` 挂载正常、工具链版本与镜像一致 |
| 常驻容器 GUI 直通 | 通过 | 容器内 GTK 探针：Wayland `backend=wayland-0`、X11 `backend=:0` |
| 容器组件版本 | 通过 | gcc 13.3.0、GTK 3.24.41、WebKitGTK 4.1 2.52.6、pkg-config 1.8.1、Go 1.25.14、Node 24.22.2、npm 11.19.1、pnpm 10.34.9、uid 1000 |
| `wails doctor`（容器） | 部分通过 | gcc/build-essential、libgtk-3-dev、npm、pkg-config 均 Installed；libwebkit 为误报（4.2） |
| CGO + GTK/WebKit 冒烟 | 通过 | 容器内编译、链接并运行探针：`GTK 3.24.41`、`WebKitGTK 2.52.6`；`ldd` 确认 `libgtk-3.so.0`、`libwebkit2gtk-4.1.so.0`、`libjavascriptcoregtk-4.1.so.0` |
| 容器 GUI 直通（Wayland） | 通过 | GTK 探针输出 `DISPLAY_OK backend=wayland-0` |
| 容器 GUI 直通（X11/XWayland） | 通过 | `GDK_BACKEND=x11` 时输出 `DISPLAY_OK backend=:0`（伴随 AT-SPI/canberra 告警，不影响窗口） |
| 容器内 `pnpm install --frozen-lockfile` | 通过 | 961 ms，`CI=true` 生效，esbuild postinstall 正常 |
| 容器内 `pnpm run build` | 通过 | `tsc` 无错误；Vite 转换 55 modules，生成 `dist/`，仅 chunk >500 KiB 提示 |
| 容器内 Vite dev server | 通过 | `vite` 271 ms 就绪，`curl 127.0.0.1:5174` 返回 HTTP 200 |
| 容器内 `go build ./...` | 失败（预期） | `app/vault.go:11:26`、`14:26: undefined: syscall.NewLazyDLL`，共 2 处 |
| 容器内 `wails build -tags webkit2_41` | 失败（预期） | 绑定生成阶段报同一 vault.go 错误（4.3） |
| 容器内 `wails dev -tags webkit2_41` | 失败（预期） | 同一阻塞点；`go mod tidy` 未改动 `go.mod`/`go.sum` |
| 构建后工作区状态 | 通过 | `git status` 仅显示既有未跟踪项（`docs/`、`ssh-tool/build/linux/`）与 `.gitignore` 改动，无构建产物污染 |

### 4.1 复核发现并修正的偏差

1. **镜像 ID 过期**：文档原记录 `f6f812bc579b`，实际最终镜像为 `87d29de6b993`（重建镜像后 ID 会再变，以 `docker image inspect ssh-tool-dev:noble` 为准）。
2. **构建错误数量记错**：原记录称 vault.go「同类错误 14 行」，复核实测为 2 处（第 11、14 行 `syscall.NewLazyDLL`）。
3. **宿主机无法直接重建 `node_modules`**：容器内 `pnpm install` 会把 `.modules.yaml` 的 `storeDir` 写成 `/workspace/.pnpm-store/v10`；宿主机再执行 `pnpm install` 会要求重建，无 TTY 时报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。全链路在容器内执行可完全规避；如宿主机确需执行，加 `CI=true`。
4. **`sudo` 限制的描述**：搭建时遇到的 `NoNewPrivs` 报错属实，但复核会话 `NoNewPrivs=0`、`sudo` 仅缺密码；当时结论（宿主机无法提权安装系统包）成立。
5. **宿主机不能构建的结论已过时**：2026-11-11 追加安装 `build-essential`、`libgtk-3-dev`、`libwebkit2gtk-4.1-dev`、`pkg-config` 后，宿主机原生 CGO/GTK/WebKit 编译、`wails build`（至 vault.go 阻塞点）均已验证通过；文档已改为「宿主机原生 + 容器可复现」双路径。

### 4.2 `wails doctor` 的已知误报

- `libwebkit` 显示 `Not Found`：Wails v2.12.0 检查的是 `libwebkit2gtk-4.0-dev`，Ubuntu 24.04 只提供 4.1，实际开发包已安装（`pkg-config --modversion webkit2gtk-4.1` 返回 `2.52.6`），编译必须显式加 `-tags webkit2_41`。
- 因此 doctor 以 `Fatal: Required dependencies missing: libwebkit` 退出，不适用于 24.04 的最终判定；以 `pkg-config` 探测和实际编译为准。

### 4.3 应用构建阻塞已解除（2026-11-12）

上表中 `vault.go` 相关失败项为 2026-11-11 复核时的历史记录。2026-11-12 完成计划阶段 1–3（`vault_windows.go`/`vault_linux.go` 平台拆分、Secret Service 凭证、拖放 `OnFileDrop` 修复，提交 `2bc60ba`）后，`go build ./...` 与 `wails build -tags webkit2_41` 均已通过，产出 `build/bin/ssh-tool`。

## 5. 已知限制

1. 应用窗口已启动验证（2026-11-12）：X11/Wayland 双后端启动冒烟与「新建连接」对话框控件树（AT-SPI）通过；视觉验证与界面手工测试按用户决定豁免，端到端交互项留待人工 QA。
2. Secret Service 已接入并验证（阶段 2，2026-11-12）：宿主机真实 GNOME Keyring 的保存/读取/清理四路径通过；容器内 Secret Service 仍需先启动 dbus 会话并解锁 gnome-keyring 才可用于测试。
3. 镜像未裁剪，包含 apt 列表与 Go 构建缓存，体积约 3.19 GB。
4. 网络依赖：`proxy.golang.org`、`go.dev` 不可达，需使用 `goproxy.cn` 与阿里云/清华镜像。
5. `frontend/node_modules` 被宿主机与容器共用，在另一侧执行安装时需 `CI=true`（见第 2 节）；两侧不要同时执行 `pnpm install`/`wails build`。
6. SSH/SFTP 测试服务器已备：Docker 容器 `omo-sshd`（`lscr.io/linuxserver/openssh-server`，127.0.0.1:2222，密码+密钥双认证），测试后已停止，`docker start omo-sshd` 可复用；Windows 侧基线回归仍需 Windows 环境。

## 6. 宿主机原生构建依赖（已安装）

2026-11-11 已通过 apt 安装（版本见 2.2）：

```bash
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
```

Wails CLI 已按 `go.mod` 固定在 v2.12.0，原生构建命令：

```bash
cd ssh-tool-linux
wails build -tags webkit2_41
wails dev -tags webkit2_41
```

Ubuntu 24.04 只提供 WebKitGTK 4.1，`-tags webkit2_41` 不可省略；`wails doctor` 的 `libwebkit Not Found` 为误报（4.2）。

## 7. 下一步

1. 阶段 4（`.deb` 打包）：生成安装包与校验值，在干净 Ubuntu 虚拟机验收安装/启动/卸载。
2. 阶段 5（全量回归与发布）：完整回归矩阵（视觉验证与界面手工测试按用户决定豁免，端到端交互项留待人工 QA）、Windows 核心回归、README 更新。
