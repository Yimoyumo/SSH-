package main

import (
	"context"
	"embed"

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
	// 初始化日志(输出到 %AppData%/ssh-tool/app.log)
	app.InitLogger()

	// 注入 Wails 事件推送函数,供 app 包向前端推 PTY 数据
	app.SetPushEvent(func(ctx context.Context, name string, data ...interface{}) {
		runtime.EventsEmit(ctx, name, data...)
	})

	a := app.NewApp()

	err := wails.Run(&options.App{
		Title:     "SSH工具",
		Width:     1200,
		Height:    800,
		MinWidth:  900,
		MinHeight: 600,
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
