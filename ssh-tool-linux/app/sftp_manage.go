package app

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"path"
)

// SftpUpload 上传文件内容(base64 编码)到远程路径。返回写入字节数。
// 通过事件 sftp:progress:<jobID> 推送进度 [written, total]。
func (a *App) SftpUpload(sessionID, contentBase64, remotePath, jobID string) (int, error) {
	log.Printf("sftpUpload: session=%s remote=%s b64len=%d job=%s", sessionID, remotePath, len(contentBase64), jobID)
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

	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return 0, fmt.Errorf("decode base64: %w", err)
	}

	if err := sc.client.MkdirAll(path.Dir(remotePath)); err != nil {
		return 0, fmt.Errorf("mkdir remote: %w", err)
	}
	w, err := sc.client.Create(remotePath)
	if err != nil {
		return 0, fmt.Errorf("create remote %s: %w", remotePath, err)
	}
	defer w.Close()

	total := int64(len(content))
	n, err := streamCopy(w, bytesReader(content), total, jobID, a.ctx)
	return int(n), err
}

// SftpUploadLocalFile 从本地路径读文件直接上传到远程,不经前端中转。
// 避免 Wails IPC 传输大字符串的截断问题。通过事件推送进度。
func (a *App) SftpUploadLocalFile(sessionID, localPath, remotePath, jobID string) (int64, error) {
	log.Printf("sftpUploadLocalFile: session=%s local=%s remote=%s job=%s", sessionID, localPath, remotePath, jobID)
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

	r, err := os.Open(localPath)
	if err != nil {
		return 0, fmt.Errorf("open local %s: %w", localPath, err)
	}
	defer r.Close()

	if err := sc.client.MkdirAll(path.Dir(remotePath)); err != nil {
		return 0, fmt.Errorf("mkdir remote: %w", err)
	}
	w, err := sc.client.Create(remotePath)
	if err != nil {
		return 0, fmt.Errorf("create remote %s: %w", remotePath, err)
	}
	defer w.Close()

	info, ierr := r.Stat()
	total := int64(0)
	if ierr == nil {
		total = info.Size()
	}
	return streamCopy(w, r, total, jobID, a.ctx)
}

// SftpDelete 删除远程文件或目录。
func (a *App) SftpDelete(sessionID, remotePath string, isDir bool) error {
	log.Printf("sftpDelete: session=%s path=%s isDir=%v", sessionID, remotePath, isDir)
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
	if isDir {
		return sc.client.RemoveDirectory(remotePath)
	}
	return sc.client.Remove(remotePath)
}

// SftpRename 重命名远程文件或目录。
func (a *App) SftpRename(sessionID, oldPath, newPath string) error {
	log.Printf("sftpRename: session=%s %s -> %s", sessionID, oldPath, newPath)
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
	return sc.client.Rename(oldPath, newPath)
}

// SftpMkdir 新建远程目录。
func (a *App) SftpMkdir(sessionID, remotePath string) error {
	log.Printf("sftpMkdir: session=%s path=%s", sessionID, remotePath)
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
	return sc.client.Mkdir(remotePath)
}

// SftpMkfile 新建远程空文件。
func (a *App) SftpMkfile(sessionID, remotePath string) error {
	log.Printf("sftpMkfile: session=%s path=%s", sessionID, remotePath)
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
	// O_CREATE|O_EXCL: 文件已存在则失败,避免 Create 截断已有文件。
	w, err := sc.client.OpenFile(remotePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY)
	if err != nil {
		return fmt.Errorf("create remote %s: %w", remotePath, err)
	}
	return w.Close()
}
