package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"
)

// ConnectionConfig 是一条 SSH 连接配置(明文部分),由 store.go 持久化。
type ConnectionConfig struct {
	ID       string `json:"id"`
	Name     string `json:"name"`     // 显示名
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	AuthType string `json:"authType"` // "password" | "key"
	// 凭证不落明文:password/keyEncrypted 存 DPAPI 加密后的 base64
	PasswordEncrypted string `json:"passwordEncrypted,omitempty"`
	KeyEncrypted      string `json:"keyEncrypted,omitempty"`
	KeyPassEncrypted  string `json:"keyPassEncrypted,omitempty"`
}

// store 管理连接配置的本地 JSON 持久化。
type store struct {
	mu       sync.RWMutex
	filePath string
	list     []ConnectionConfig
}

// newStore 在用户配置目录下创建 store。
func newStore() (*store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	appDir := filepath.Join(dir, "ssh-tool")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, err
	}
	s := &store{filePath: filepath.Join(appDir, "connections.json")}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.filePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil // 首次运行
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &s.list)
}

// save 持久化到磁盘。调用方必须已持有 s.mu(写锁或读锁)。
func (s *store) save() error {
	data, err := json.MarshalIndent(s.list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}

// List 返回所有连接配置。
func (s *store) List() []ConnectionConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ConnectionConfig, len(s.list))
	copy(out, s.list)
	return out
}

// Save 新增或更新一条配置(按 ID)。
func (s *store) Save(cfg *ConnectionConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cfg.ID == "" {
		cfg.ID = uuid.NewString()
		s.list = append(s.list, *cfg)
	} else {
		found := false
		for i := range s.list {
			if s.list[i].ID == cfg.ID {
				s.list[i] = *cfg
				found = true
				break
			}
		}
		if !found {
			s.list = append(s.list, *cfg)
		}
	}
	return s.save()
}

// Delete 按 ID 删除。
func (s *store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.list {
		if c.ID == id {
			s.list = append(s.list[:i], s.list[i+1:]...)
			return s.save()
		}
	}
	return errors.New("not found")
}

