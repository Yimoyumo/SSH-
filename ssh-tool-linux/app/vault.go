package app

import (
	"encoding/base64"
	"fmt"
	"syscall"
	"unsafe"
)

var (
	crypt32       = syscall.NewLazyDLL("crypt32.dll")
	procProtect   = crypt32.NewProc("CryptProtectData")
	procUnprotect = crypt32.NewProc("CryptUnprotectData")
	kernel32      = syscall.NewLazyDLL("kernel32.dll")
	procLocalFree = kernel32.NewProc("LocalFree")
)

// dataBlob 对应 Windows DATA_BLOB。
type dataBlob struct {
	cbData uint32
	pbData uintptr
}

// Encrypt 用 Windows DPAPI 加密明文,返回 base64 密文。
// 当前用户态加密,不可跨用户/机器解密。
func Encrypt(plain string) (string, error) {
	in := []byte(plain)
	inBlob := bytesToBlob(in)
	var outBlob dataBlob
	r1, _, err := procProtect.Call(
		uintptr(unsafe.Pointer(&inBlob)),
		0, // szDataDescr
		0, // pOptionalEntropy
		0, // pvReserved
		0, // pPromptStruct
		0, // dwFlags
		uintptr(unsafe.Pointer(&outBlob)),
	)
	if r1 == 0 {
		return "", fmt.Errorf("CryptProtectData failed: %w", err)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))
	return base64.StdEncoding.EncodeToString(blobToBytes(outBlob)), nil
}

// Decrypt 解密 DPAPI base64 密文。
func Decrypt(cipher string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(cipher)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	inBlob := bytesToBlob(raw)
	var outBlob dataBlob
	r1, _, err := procUnprotect.Call(
		uintptr(unsafe.Pointer(&inBlob)),
		0, // szDataDescr
		0, // pOptionalEntropy
		0, // pvReserved
		0, // pPromptStruct
		0, // dwFlags
		uintptr(unsafe.Pointer(&outBlob)),
	)
	if r1 == 0 {
		return "", fmt.Errorf("CryptUnprotectData failed: %w", err)
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))
	return string(blobToBytes(outBlob)), nil
}

func bytesToBlob(b []byte) dataBlob {
	if len(b) == 0 {
		return dataBlob{}
	}
	return dataBlob{
		cbData: uint32(len(b)),
		pbData: uintptr(unsafe.Pointer(&b[0])),
	}
}

func blobToBytes(blob dataBlob) []byte {
	if blob.cbData == 0 {
		return nil
	}
	out := make([]byte, blob.cbData)
	copy(out, (*[1 << 30]byte)(unsafe.Pointer(blob.pbData))[:blob.cbData:blob.cbData])
	return out
}
