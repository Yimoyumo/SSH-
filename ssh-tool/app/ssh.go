package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

// sshConn 封装一条底层 SSH 连接。
type sshConn struct {
	client  *ssh.Client
	config  ConnectionConfig
	mu      sync.Mutex
	closed  bool
}

// Connect 建立 SSH 连接,返回新 Session。
// 凭证(密码/密钥)从 vault 解密后用于认证,不落内存副本。
func (a *App) Connect(cfg ConnectionConfig) (string, error) {
	if cfg.Port == 0 {
		cfg.Port = 22
	}
	log.Printf("connect: %s@%s:%d auth=%s", cfg.User, cfg.Host, cfg.Port, cfg.AuthType)

	authMethods, err := a.buildAuth(cfg)
	if err != nil {
		log.Printf("connect: auth failed: %v", err)
		return "", fmt.Errorf("auth: %w", err)
	}

	sshCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            authMethods,
		HostKeyCallback: insecureHostKey, // 个人工具,先信任;后续可加 known_hosts
		Timeout:         10 * time.Second,
	}

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	client, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		log.Printf("connect: dial %s failed: %v", addr, err)
		return "", fmt.Errorf("dial %s: %w", addr, err)
	}

	// keepalive
	go keepalive(client, 20*time.Second)

	sessionID := uuid.NewString()
	log.Printf("connect: OK session=%s addr=%s", sessionID, addr)
	sess := &Session{
		ID:      sessionID,
		Config:  cfg,
		sshConn: &sshConn{client: client, config: cfg},
		terms:   make(map[string]*Terminal),
	}

	a.mu.Lock()
	a.sessions[sessionID] = sess
	a.mu.Unlock()

	return sessionID, nil
}

// CloseSession 关闭整个 SSH 连接及其所有终端/SFTP。
func (a *App) CloseSession(sessionID string) error {
	log.Printf("closeSession: session=%s", sessionID)
	a.mu.Lock()
	sess, ok := a.sessions[sessionID]
	if ok {
		delete(a.sessions, sessionID)
	}
	a.mu.Unlock()
	if !ok {
		return errors.New("session not found")
	}
	return sess.close()
}

// buildAuth 从 vault 解密凭证,构造 ssh.AuthMethod。
func (a *App) buildAuth(cfg ConnectionConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	switch cfg.AuthType {
	case "password":
		if cfg.PasswordEncrypted == "" {
			return nil, errors.New("password empty")
		}
		pw, err := Decrypt(cfg.PasswordEncrypted)
		if err != nil {
			return nil, fmt.Errorf("decrypt password: %w", err)
		}
		methods = append(methods, ssh.Password(pw))
	case "key":
		if cfg.KeyEncrypted == "" {
			return nil, errors.New("key empty")
		}
		// KeyEncrypted 存的是 DPAPI 加密后的 base64,先解密还原 PEM 原文
		pemStr, err := Decrypt(cfg.KeyEncrypted)
		if err != nil {
			return nil, fmt.Errorf("decrypt key: %w", err)
		}
		keyRaw := []byte(pemStr)
		var signer ssh.Signer
		if cfg.KeyPassEncrypted != "" {
			pass, err := Decrypt(cfg.KeyPassEncrypted)
			if err != nil {
				return nil, fmt.Errorf("decrypt key pass: %w", err)
			}
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyRaw, []byte(pass))
			if err != nil {
				return nil, fmt.Errorf("parse key with pass: %w", err)
			}
		} else {
			signer, err = ssh.ParsePrivateKey(keyRaw)
			if err != nil {
				return nil, fmt.Errorf("parse key: %w", err)
			}
		}
		methods = append(methods, ssh.PublicKeys(signer))
	default:
		return nil, fmt.Errorf("unknown auth type: %s", cfg.AuthType)
	}
	return methods, nil
}

// OpenTerminal 在指定 Session 上开一个新 PTY shell channel。
// 返回 terminalID。PTY 输出通过 Wails 事件 "term:data:<terminalID>" 推到前端。
func (a *App) OpenTerminal(sessionID string, rows, cols int) (string, error) {
	log.Printf("openTerminal: session=%s rows=%d cols=%d", sessionID, rows, cols)
	a.mu.RLock()
	sess, ok := a.sessions[sessionID]
	a.mu.RUnlock()
	if !ok {
		log.Printf("openTerminal: session not found: %s", sessionID)
		return "", errors.New("session not found")
	}

	term, err := sess.openTerminal(a.ctx, rows, cols)
	if err != nil {
		log.Printf("openTerminal: failed: %v", err)
		return "", err
	}
	log.Printf("openTerminal: OK term=%s", term.ID)
	return term.ID, nil
}

// WriteTerminal 前端把按键输入发到这里。
func (a *App) WriteTerminal(terminalID string, data string) error {
	a.mu.RLock()
	for _, sess := range a.sessions {
		if t, ok := sess.terms[terminalID]; ok {
			a.mu.RUnlock()
			return sess.writeTerm(t, data)
		}
	}
	a.mu.RUnlock()
	return errors.New("terminal not found")
}

// ResizeTerminal 前端窗口缩放时调用。
func (a *App) ResizeTerminal(terminalID string, rows, cols int) error {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, sess := range a.sessions {
		if t, ok := sess.terms[terminalID]; ok {
			return sess.resizeTerm(t, rows, cols)
		}
	}
	return errors.New("terminal not found")
}

// CloseTerminal 关闭单个终端 channel(不影响整条连接)。
func (a *App) CloseTerminal(terminalID string) error {
	log.Printf("closeTerminal: term=%s", terminalID)
	a.mu.Lock()
	var found *Session
	var term *Terminal
	for _, sess := range a.sessions {
		if t, ok := sess.terms[terminalID]; ok {
			found = sess
			term = t
			delete(sess.terms, terminalID)
			break
		}
	}
	a.mu.Unlock()
	if found == nil {
		return errors.New("terminal not found")
	}
	found.mu.Lock()
	defer found.mu.Unlock()
	return found.closeTermLocked(term)
}

// MaybeCloseSession 当 session 上无终端也无 SFTP 活动时,关闭整条 SSH 连接。
// 返回 true 表示已关闭。前端关最后一个标签后调用,防止连接泄漏。
func (a *App) MaybeCloseSession(sessionID string) (bool, error) {
	a.mu.Lock()
	sess, ok := a.sessions[sessionID]
	if !ok {
		a.mu.Unlock()
		return false, nil
	}
	sess.mu.Lock()
	empty := len(sess.terms) == 0
	sess.mu.Unlock()
	if !empty {
		a.mu.Unlock()
		return false, nil
	}
	delete(a.sessions, sessionID)
	a.mu.Unlock()
	log.Printf("maybeCloseSession: closing session=%s (no terminals left)", sessionID)
	return true, sess.close()
}

// --- Session 方法 ---

func (s *Session) openTerminal(ctx context.Context, rows, cols int) (*Terminal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, errors.New("session closed")
	}

	sshSess, err := s.sshConn.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("new session: %w", err)
	}

	stdin, err := sshSess.StdinPipe()
	if err != nil {
		sshSess.Close()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := sshSess.StdoutPipe()
	if err != nil {
		sshSess.Close()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	// 请求 PTY
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	termType := "xterm-256color"
	if err := sshSess.RequestPty(termType, rows, cols, modes); err != nil {
		sshSess.Close()
		return nil, fmt.Errorf("request pty: %w", err)
	}
	if err := sshSess.Shell(); err != nil {
		sshSess.Close()
		return nil, fmt.Errorf("start shell: %w", err)
	}

	termID := uuid.NewString()
	term := &Terminal{ID: termID, sess: sshSess, stdin: stdin}
	s.terms[termID] = term

	// 推流 PTY 输出到前端
	go func() {
		buf := make([]byte, 8192)
		eventName := "term:data:" + termID
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				pushEvent(ctx, eventName, string(buf[:n]))
			}
			if err != nil {
				log.Printf("terminal stream exit: term=%s err=%v", termID, err)
				pushEvent(ctx, "term:exit:"+termID, "")
				sshSess.Close()
				s.mu.Lock()
				delete(s.terms, termID)
				s.mu.Unlock()
				return
			}
		}
	}()

	return term, nil
}

func (s *Session) writeTerm(t *Terminal, data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := t.stdin.Write([]byte(data))
	return err
}

func (s *Session) resizeTerm(t *Terminal, rows, cols int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return t.sess.WindowChange(rows, cols)
}

// closeTermLocked 假定调用方已持有 s.mu。
func (s *Session) closeTermLocked(t *Terminal) error {
	return t.sess.Close()
}

func (s *Session) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	for id, t := range s.terms {
		s.closeTermLocked(t)
		delete(s.terms, id)
	}
	if s.sftp != nil {
		s.sftp.close()
	}
	return s.sshConn.client.Close()
}

// keepalive 周期发 keepalive 请求,失败则关闭连接。
func keepalive(client *ssh.Client, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for range t.C {
		_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
		if err != nil {
			return
		}
	}
}

// insecureHostKey 接受任意主机密钥。个人工具内网使用。
// 若需 known_hosts 校验,替换此回调。
func insecureHostKey(hostname string, remote net.Addr, key ssh.PublicKey) error {
	return nil
}

// pushEvent 向前端推 Wails 事件。
// 由 main.go 注入实际实现(因为依赖 wails runtime,而 app 包不 import wails)。
var pushEvent func(ctx context.Context, name string, data ...interface{}) = func(context.Context, string, ...interface{}) {
	// 默认空实现,main.go 启动时注入
}

// SetPushEvent 供 main.go 注入事件推送函数。
func SetPushEvent(fn func(ctx context.Context, name string, data ...interface{})) {
	pushEvent = fn
}
