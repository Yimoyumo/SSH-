//go:build linux

package app

import (
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/zalando/go-keyring"
)

// Linux 凭证存储:真实凭证写入 Secret Service(GNOME Keyring),
// 配置 JSON 只保存凭证引用,不保存秘密本体。
const (
	keyringService  = "ssh-tool"
	cipherRefPrefix = "keyring:v1:"
)

// Encrypt 把明文写入 Secret Service,返回凭证引用。
// 引用只含格式版本与随机标识,可安全落盘到配置 JSON。
func Encrypt(plain string) (string, error) {
	if plain == "" {
		return "", nil // 与 Windows 语义一致:空串原样返回
	}
	id := uuid.NewString()
	if err := keyring.Set(keyringService, id, plain); err != nil {
		return "", fmt.Errorf("Secret Service 写入失败(GNOME Keyring 不可用或已锁定): %w", err)
	}
	return cipherRefPrefix + id, nil
}

// Decrypt 按凭证引用从 Secret Service 读取明文。
func Decrypt(cipher string) (string, error) {
	if cipher == "" {
		return "", nil
	}
	id, ok := strings.CutPrefix(cipher, cipherRefPrefix)
	if !ok {
		return "", errors.New("凭证引用格式无效(非本机 Secret Service 引用;Windows 版 DPAPI 密文不支持跨系统迁移)")
	}
	plain, err := keyring.Get(keyringService, id)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", fmt.Errorf("凭证不存在或已被钥匙串删除,请重新录入连接凭证(id=%s)", id)
	}
	if err != nil {
		return "", fmt.Errorf("Secret Service 读取失败(GNOME Keyring 不可用或已锁定): %w", err)
	}
	return plain, nil
}

// DeleteCipher 删除凭证引用对应的 Secret Service 条目。
// 非本机引用(如 Windows DPAPI 密文)视为无外部秘密可清理。
func DeleteCipher(ref string) error {
	if ref == "" {
		return nil
	}
	id, ok := strings.CutPrefix(ref, cipherRefPrefix)
	if !ok {
		return nil
	}
	if err := keyring.Delete(keyringService, id); err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("Secret Service 删除凭证失败(id=%s): %w", id, err)
	}
	return nil
}
