package app

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var fontSources = map[string][]string{
	"JetBrains Mono": {
		"https://cdn.jsdelivr.net/gh/JetBrains/JetBrainsMono@master/fonts/ttf/JetBrainsMono-Regular.ttf",
		"https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf",
	},
	"Fira Code": {
		"https://cdn.jsdelivr.net/gh/tonsky/FiraCode@master/distr/ttf/FiraCode-Regular.ttf",
		"https://raw.githubusercontent.com/tonsky/FiraCode/master/distr/ttf/FiraCode-Regular.ttf",
	},
}

// CustomFont 供前端注册到 Web 字体系统的字体文件(base64 TTF)。
type CustomFont struct {
	Family string `json:"family"`
	Data   string `json:"data"`
}

func fontsDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "ssh-tool", "fonts")
}

func fontFileName(family string) string {
	return strings.ToLower(strings.ReplaceAll(family, " ", "-")) + ".ttf"
}

func fetchFont(url string) ([]byte, error) {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if len(data) < 10000 {
		return nil, fmt.Errorf("字体文件过小(%d bytes),疑似下载失败", len(data))
	}
	return data, nil
}

// DownloadFont 按字体名下载 TTF 并持久化到配置目录,返回 base64 内容供前端注册。
func (a *App) DownloadFont(family string) (CustomFont, error) {
	urls, ok := fontSources[family]
	if !ok {
		return CustomFont{}, fmt.Errorf("字体 %q 不支持自动下载", family)
	}
	log.Printf("downloadFont: %s", family)
	var lastErr error
	var data []byte
	for _, u := range urls {
		data, lastErr = fetchFont(u)
		if lastErr == nil {
			break
		}
		log.Printf("downloadFont: %s 失败: %v", u, lastErr)
	}
	if lastErr != nil {
		return CustomFont{}, fmt.Errorf("下载 %s 失败: %w", family, lastErr)
	}
	dir := fontsDir()
	if dir == "" {
		return CustomFont{}, os.ErrNotExist
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return CustomFont{}, err
	}
	if err := os.WriteFile(filepath.Join(dir, fontFileName(family)), data, 0644); err != nil {
		return CustomFont{}, err
	}
	return CustomFont{Family: family, Data: base64.StdEncoding.EncodeToString(data)}, nil
}

// ListCustomFonts 返回配置目录里已下载的自定义字体,供前端启动时注册。
func (a *App) ListCustomFonts() ([]CustomFont, error) {
	dir := fontsDir()
	if dir == "" {
		return nil, nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil
	}
	familyByFile := map[string]string{}
	for family := range fontSources {
		familyByFile[fontFileName(family)] = family
	}
	var out []CustomFont
	for _, e := range entries {
		family, ok := familyByFile[e.Name()]
		if !ok || e.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil || len(data) < 10000 {
			continue
		}
		out = append(out, CustomFont{Family: family, Data: base64.StdEncoding.EncodeToString(data)})
	}
	return out, nil
}
