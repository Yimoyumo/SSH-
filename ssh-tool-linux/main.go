package main

import (
	"context"
	"embed"
	"os"

	"ssh-tool/app"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// WebKitGTK 的加速合成路径在部分 Linux 驱动/Wayland 组合下帧调度异常,
	// 表现为输入回显成批延迟数百毫秒。终端类界面用软件合成更稳,
	// 如需恢复加速可用 WEBKIT_DISABLE_COMPOSITING_MODE=0 覆盖。
	if os.Getenv("WEBKIT_DISABLE_COMPOSITING_MODE") == "" {
		os.Setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "1")
	}

	// 初始化日志(输出到 %AppData%/ssh-tool/app.log)
	app.InitLogger()

	// 注入 Wails 事件推送函数,供 app 包向前端推 PTY 数据
	app.SetPushEvent(func(ctx context.Context, name string, data ...interface{}) {
		runtime.EventsEmit(ctx, name, data...)
	})

	a := app.NewApp()
	settings := app.LoadSettings()

	err := wails.Run(&options.App{
		Title:     "SSH工具",
		Width:     1200,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
		Frameless: settings.WindowStyle == "custom",
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 13, G: 13, B: 13, A: 1}, // OLED 黑
		OnStartup:        a.Startup,
		Bind: []interface{}{
			a,
		},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
