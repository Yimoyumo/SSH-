package app

import (
	"errors"
	"fmt"
	"io"
	"log"
)

// 文本编辑上限 1MB,超出引导用户下载后用本地编辑器。
const maxTextSize = 1 << 20

// SftpReadText 读取远程文本文件内容。仅支持 UTF-8 文本。
// 超 1MB 或含 NUL 字节(疑似二进制)时拒绝。
func (a *App) SftpReadText(sessionID, remotePath string) (string, error) {
	log.Printf("sftpReadText: session=%s path=%s", sessionID, remotePath)
	sess, err := a.getSession(sessionID)
	if err != nil {
		return "", err
	}
	sc, err := sess.ensureSftp()
	if err != nil {
		return "", err
	}
	sc.mu.Lock()
	defer sc.mu.Unlock()

	r, err := sc.client.Open(remotePath)
	if err != nil {
		return "", fmt.Errorf("open remote %s: %w", remotePath, err)
	}
	defer r.Close()

	// 多读 1 字节用于判断是否超限
	buf, err := io.ReadAll(io.LimitReader(r, maxTextSize+1))
	if err != nil {
		return "", fmt.Errorf("read %s: %w", remotePath, err)
	}
	if int64(len(buf)) > maxTextSize {
		return "", fmt.Errorf("文件过大(>1MB),请下载后用本地编辑器打开")
	}
	if containsNUL(buf) {
		return "", errors.New("文件可能是二进制,无法用文本编辑器打开")
	}
	return string(buf), nil
}

// SftpWriteText 全量覆盖写回远程文本文件。
func (a *App) SftpWriteText(sessionID, remotePath, content string) error {
	log.Printf("sftpWriteText: session=%s path=%s bytes=%d", sessionID, remotePath, len(content))
	sess, err := a.getSession(sessionID)
	if err != nil {
		return err
	}
	sc, err := sess.ensureSftp()
	if err != nil {
		return err
	}
	sc.mu.Lock()
	defer sc.mu.Unlock()

	w, err := sc.client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("create remote %s: %w", remotePath, err)
	}
	defer w.Close()
	if _, err := w.Write([]byte(content)); err != nil {
		return fmt.Errorf("write %s: %w", remotePath, err)
	}
	return nil
}

// containsNUL 检测字节切片是否含 NUL 字节(二进制文件特征)。
func containsNUL(b []byte) bool {
	for _, c := range b {
		if c == 0 {
			return true
		}
	}
	return false
}
