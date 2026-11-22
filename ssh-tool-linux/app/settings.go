package app

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Settings 用户偏好设置,持久化到 ~/.config/ssh-tool/settings.json。
type Settings struct {
	TerminalFontSize   int    `json:"terminalFontSize"`
	TerminalFontFamily string `json:"terminalFontFamily"`
	WindowStyle        string `json:"windowStyle"` // custom=自定义标题栏(无边框) system=系统标题栏
}

func defaultSettings() Settings {
	return Settings{
		TerminalFontSize:   14,
		TerminalFontFamily: "Ubuntu Sans Mono",
		WindowStyle:        "custom",
	}
}

func settingsPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "ssh-tool", "settings.json")
}

// LoadSettings 读取设置,缺失或非法字段回退默认值。
func LoadSettings() Settings {
	out := defaultSettings()
	p := settingsPath()
	if p == "" {
		return out
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return out
	}
	var v Settings
	if err := json.Unmarshal(data, &v); err != nil {
		return out
	}
	if v.TerminalFontSize >= 8 && v.TerminalFontSize <= 32 {
		out.TerminalFontSize = v.TerminalFontSize
	}
	if v.TerminalFontFamily != "" {
		out.TerminalFontFamily = v.TerminalFontFamily
	}
	if v.WindowStyle == "custom" || v.WindowStyle == "system" {
		out.WindowStyle = v.WindowStyle
	}
	return out
}

// GetSettings 返回当前设置。
func (a *App) GetSettings() Settings {
	return LoadSettings()
}

// SaveSettings 保存设置,非法值收敛后落盘。
func (a *App) SaveSettings(v Settings) (Settings, error) {
	out := defaultSettings()
	if v.TerminalFontSize >= 8 && v.TerminalFontSize <= 32 {
		out.TerminalFontSize = v.TerminalFontSize
	}
	if v.TerminalFontFamily != "" {
		out.TerminalFontFamily = v.TerminalFontFamily
	}
	if v.WindowStyle == "custom" || v.WindowStyle == "system" {
		out.WindowStyle = v.WindowStyle
	}
	p := settingsPath()
	if p == "" {
		return out, os.ErrNotExist
	}
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		return out, err
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return out, err
	}
	return out, os.WriteFile(p, data, 0644)
}
