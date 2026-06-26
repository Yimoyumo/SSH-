package app

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/pkg/sftp"
)

// sftpSession 封装一条 SFTP 通道(复用 SSH 连接)。
type sftpSession struct {
	client *sftp.Client
	mu     sync.Mutex
}

// FileEntry 目录项,给前端列表用。
type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime int64  `json:"modTime"` // unix ts
	Mode    string `json:"mode"`    // 如 "0755"
}

// SftpList 列出远程目录。sessionID 上若未开 sftp,惰性开启。
func (a *App) SftpList(sessionID, remoteDir string) ([]FileEntry, error) {
	log.Printf("sftpList: session=%s dir=%s", sessionID, remoteDir)
	sess, err := a.getSession(sessionID)
	if err != nil {
		return nil, err
	}
	sc, err := sess.ensureSftp()
	if err != nil {
		return nil, err
	}
	sc.mu.Lock()
	defer sc.mu.Unlock()

	entries, err := sc.client.ReadDir(remoteDir)
	if err != nil {
		return nil, fmt.Errorf("read dir %s: %w", remoteDir, err)
	}
	out := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, FileEntry{
			Name:    e.Name(),
			Size:    e.Size(),
			IsDir:   e.IsDir(),
			ModTime: e.ModTime().Unix(),
			Mode:    e.Mode().String(),
		})
	}
	return out, nil
}

// SftpDownload 下载远程文件到本地路径。返回写入字节数。
// localPath 若为纯文件名(无分隔符),自动存到用户下载目录。
// 通过事件 sftp:progress:<jobID> 推送进度 [written, total]。
func (a *App) SftpDownload(sessionID, remotePath, localPath, jobID string) (int64, error) {
	log.Printf("sftpDownload: session=%s remote=%s local=%s job=%s", sessionID, remotePath, localPath, jobID)
	sess, err := a.getSession(sessionID)
	if err != nil {
		return 0, err
	}
	sc, err := sess.ensureSftp()
	if err != nil {
		return 0, err
	}
	sc.mu.Lock()
	defer sc.mu.Unlock()

	r, err := sc.client.Open(remotePath)
	if err != nil {
		return 0, fmt.Errorf("open remote %s: %w", remotePath, err)
	}
	defer r.Close()

	// 纯文件名 → 用户下载目录
	if !filepath.IsAbs(localPath) && !containsSlash(localPath) {
		home, herr := os.UserHomeDir()
		if herr == nil {
			localPath = filepath.Join(home, "Downloads", localPath)
		}
	}
	if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
		return 0, fmt.Errorf("mkdir local: %w", err)
	}
	w, err := os.Create(localPath)
	if err != nil {
		return 0, fmt.Errorf("create local %s: %w", localPath, err)
	}
	defer w.Close()

	// 流式分块 + 进度推送
	info, ierr := r.Stat()
	total := int64(0)
	if ierr == nil {
		total = info.Size()
	}
	return streamCopy(w, r, total, jobID, a.ctx)
}

func containsSlash(s string) bool {
	for _, c := range s {
		if c == '/' || c == '\\' {
			return true
		}
	}
	return false
}

// streamCopy 分块复制并推送进度。事件名 sftp:progress:<jobID>,payload [written, total]。
func streamCopy(dst io.Writer, src io.Reader, total int64, jobID string, ctx context.Context) (int64, error) {
	buf := make([]byte, 64*1024)
	var written int64
	event := "sftp:progress:" + jobID
	for {
		n, err := src.Read(buf)
		if n > 0 {
			nw, werr := dst.Write(buf[:n])
			written += int64(nw)
			if total > 0 {
				pushEvent(ctx, event, written, total)
			}
			if werr != nil {
				return written, werr
			}
		}
		if err == io.EOF {
			pushEvent(ctx, event, written, total)
			return written, nil
		}
		if err != nil {
			return written, err
		}
	}
}

// bytesReader 把 []byte 包成 io.Reader(避免 import bytes 的命名冲突)。
// 供 sftp_manage.go 的 SftpUpload 使用。
func bytesReader(b []byte) io.Reader {
	return &byteSliceReader{b: b}
}

type byteSliceReader struct {
	b []byte
	i int
}

func (r *byteSliceReader) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}

// --- Session 方法 ---

func (s *Session) ensureSftp() (*sftpSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, fmt.Errorf("session closed")
	}
	if s.sftp == nil {
		c, err := sftp.NewClient(s.sshConn.client)
		if err != nil {
			return nil, fmt.Errorf("new sftp: %w", err)
		}
		s.sftp = &sftpSession{client: c}
	}
	return s.sftp, nil
}

func (s *sftpSession) close() error {
	return s.client.Close()
}

// getSession 从 App 取 session,加读锁。
func (a *App) getSession(sessionID string) (*Session, error) {
	a.mu.RLock()
	sess, ok := a.sessions[sessionID]
	a.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("session not found")
	}
	return sess, nil
}
