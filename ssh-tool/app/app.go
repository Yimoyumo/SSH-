package app

import (
	"context"
	"encoding/base64"
	"errors"
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
// 凭证非空一律加密(Windows DPAPI / Linux Secret Service);编辑时空值表示保持原凭证不变。
// 新配置落盘失败回滚本次新建凭证;落盘成功后清理被替换的旧凭证。
func (a *App) SaveConnection(cfg ConnectionConfig) (string, error) {
	log.Printf("saveConnection: id=%q name=%s host=%s:%d", cfg.ID, cfg.Name, cfg.Host, cfg.Port)

	var old *ConnectionConfig
	if cfg.ID != "" {
		for _, existing := range a.store.List() {
			if existing.ID == cfg.ID {
				e := existing
				old = &e
				break
			}
		}
	}

	var created []string
	for _, field := range []*string{&cfg.PasswordEncrypted, &cfg.KeyEncrypted, &cfg.KeyPassEncrypted} {
		if *field == "" {
			continue
		}
		enc, err := Encrypt(*field)
		if err != nil {
			rollbackCiphers(created)
			return "", fmt.Errorf("encrypt credential: %w", err)
		}
		*field = enc
		created = append(created, enc)
	}

	// 编辑时空凭证:从已存配置回填,避免清空
	if old != nil {
		if cfg.PasswordEncrypted == "" {
			cfg.PasswordEncrypted = old.PasswordEncrypted
		}
		if cfg.KeyEncrypted == "" {
			cfg.KeyEncrypted = old.KeyEncrypted
		}
		if cfg.KeyPassEncrypted == "" {
			cfg.KeyPassEncrypted = old.KeyPassEncrypted
		}
	}

	if err := a.store.Save(&cfg); err != nil {
		rollbackCiphers(created)
		return "", err
	}

	if old != nil {
		for _, ref := range []string{old.PasswordEncrypted, old.KeyEncrypted, old.KeyPassEncrypted} {
			if ref == "" || cipherInUse(&cfg, ref) {
				continue
			}
			if err := DeleteCipher(ref); err != nil {
				log.Printf("saveConnection: 清理旧凭证失败: %v", err)
			}
		}
	}
	return cfg.ID, nil
}

// DeleteConnection 删除连接配置,并同步清理其凭证。
// 凭证清理失败返回可诊断错误,不静默忽略。
func (a *App) DeleteConnection(id string) error {
	var target *ConnectionConfig
	for _, existing := range a.store.List() {
		if existing.ID == id {
			e := existing
			target = &e
			break
		}
	}
	if err := a.store.Delete(id); err != nil {
		return err
	}
	if target == nil {
		return nil
	}
	var errs []error
	for _, ref := range []string{target.PasswordEncrypted, target.KeyEncrypted, target.KeyPassEncrypted} {
		if ref == "" {
			continue
		}
		if err := DeleteCipher(ref); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		joined := errors.Join(errs...)
		log.Printf("deleteConnection: id=%s 凭证清理失败: %v", id, joined)
		return fmt.Errorf("连接已删除,但凭证清理失败: %w", joined)
	}
	return nil
}

func rollbackCiphers(refs []string) {
	for _, ref := range refs {
		if err := DeleteCipher(ref); err != nil {
			log.Printf("rollback: 清理凭证失败: %v", err)
		}
	}
}

func cipherInUse(cfg *ConnectionConfig, ref string) bool {
	return cfg.PasswordEncrypted == ref || cfg.KeyEncrypted == ref || cfg.KeyPassEncrypted == ref
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
	ID    string
	sess  *ssh.Session
	stdin io.WriteCloser
}
