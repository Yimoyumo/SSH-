package app

import (
	"log"
	"os"
	"path/filepath"
)

// InitLogger 初始化日志,输出到 %AppData%/ssh-tool/app.log。
// 每次启动截断旧日志。失败则回退到标准错误。
func InitLogger() {
	dir, err := os.UserConfigDir()
	if err != nil {
		return
	}
	appDir := filepath.Join(dir, "ssh-tool")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return
	}
	logPath := filepath.Join(appDir, "app.log")
	f, err := os.Create(logPath) // 截断模式
	if err != nil {
		return
	}
	log.SetOutput(f)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Printf("logger initialized: %s", logPath)
}

// LogPath 返回当前日志文件路径,供前端展示。
func (a *App) LogPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "ssh-tool", "app.log")
}

// LogError 供前端把错误转发到后端日志文件。
func (a *App) LogError(msg string) {
	log.Printf("[frontend] %s", msg)
}
