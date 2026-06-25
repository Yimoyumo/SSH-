package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// App 是应用核心,持有 Wails context 和所有 SSH 会话。
type App struct {
	ctx      context.Context
	mu       sync.RWMutex
	sessions map[string]*Session
	store    *store
}

// NewApp 创建 App 实例。store 失败时返回带空 store 的 App(连接功能仍可用,仅无法持久化)。
func NewApp() *App {
	s, err := newStore()
	if err != nil {
		s = &store{list: nil}
	}
	return &App{
		sessions: make(map[string]*Session),
		store:    s,
	}
}

// Startup 由 Wails 在启动时调用。
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// ListConnections 返回所有已保存的连接配置。
func (a *App) ListConnections() []ConnectionConfig {
	return a.store.List()
}

// SaveConnection 新增或更新连接配置。
// 凭证非空一律 DPAPI 加密;编辑时空值表示保持原密文不变。
func (a *App) SaveConnection(cfg ConnectionConfig) (string, error) {
	log.Printf("saveConnection: id=%q name=%s host=%s:%d", cfg.ID, cfg.Name, cfg.Host, cfg.Port)
	if cfg.PasswordEncrypted != "" {
		enc, err := Encrypt(cfg.PasswordEncrypted)
		if err != nil {
			return "", fmt.Errorf("encrypt password: %w", err)
		}
		cfg.PasswordEncrypted = enc
	}
	if cfg.KeyEncrypted != "" {
		enc, err := Encrypt(cfg.KeyEncrypted)
		if err != nil {
			return "", fmt.Errorf("encrypt key: %w", err)
		}
		cfg.KeyEncrypted = enc
	}
	if cfg.KeyPassEncrypted != "" {
		enc, err := Encrypt(cfg.KeyPassEncrypted)
		if err != nil {
			return "", fmt.Errorf("encrypt key pass: %w", err)
		}
		cfg.KeyPassEncrypted = enc
	}

	// 编辑时空凭证:从已存配置回填,避免清空
	if cfg.ID != "" {
		for _, existing := range a.store.List() {
			if existing.ID == cfg.ID {
				if cfg.PasswordEncrypted == "" {
					cfg.PasswordEncrypted = existing.PasswordEncrypted
				}
				if cfg.KeyEncrypted == "" {
					cfg.KeyEncrypted = existing.KeyEncrypted
				}
				if cfg.KeyPassEncrypted == "" {
					cfg.KeyPassEncrypted = existing.KeyPassEncrypted
				}
				break
			}
		}
	}

	if err := a.store.Save(&cfg); err != nil {
		return "", err
	}
	return cfg.ID, nil
}

// DeleteConnection 删除连接配置。
func (a *App) DeleteConnection(id string) error {
	return a.store.Delete(id)
}

// SaveFileDialog 弹出系统保存文件对话框,返回用户选择的本地路径。
// 空字符串表示用户取消。
func (a *App) SaveFileDialog(title, defaultFilename string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app not started")
	}
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultFilename,
	})
}

// OpenFileDialog 弹出系统打开文件对话框,返回用户选择的本地文件路径。
func (a *App) OpenFileDialog(title string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("app not started")
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
	})
}

// ReadLocalFile 读取本地文件为 base64,供前端上传使用。
func (a *App) ReadLocalFile(localPath string) (string, error) {
	log.Printf("readLocalFile: path=%s", localPath)
	data, err := os.ReadFile(localPath)
	if err != nil {
		log.Printf("readLocalFile: failed: %v", err)
		return "", fmt.Errorf("read %s: %w", localPath, err)
	}
	log.Printf("readLocalFile: OK %d bytes", len(data))
	return base64.StdEncoding.EncodeToString(data), nil
}

// Session 表示一个 SSH 连接,可挂多个终端 channel 和一个 SFTP。
type Session struct {
	ID      string
	Config  ConnectionConfig
	sshConn *sshConn
	terms   map[string]*Terminal
	sftp    *sftpSession
	mu      sync.Mutex
	closed  bool
}

// Terminal 表示一个 PTY shell 会话。
type Terminal struct {
	ID     string
	sess   *ssh.Session
	stdin  io.WriteCloser
}
