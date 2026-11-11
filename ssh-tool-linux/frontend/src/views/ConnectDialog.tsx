import { useState, useEffect } from "react";
import type { app } from "../../wailsjs/go/models";
import "./ConnectDialog.css";

interface ConnectDialogProps {
  open: boolean;
  editing: app.ConnectionConfig | null;
  onSave: (cfg: app.ConnectionConfig) => Promise<string>;
  onClose: () => void;
}

export default function ConnectDialog({ open, editing, onSave, onClose }: ConnectDialogProps) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [user, setUser] = useState("");
  const [authType, setAuthType] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [keyContent, setKeyContent] = useState("");
  const [keyPass, setKeyPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setHost(editing.host);
        setPort(editing.port || 22);
        setUser(editing.user);
        setAuthType((editing.authType as "password" | "key") || "password");
        setPassword("");
        setKeyContent("");
        setKeyPass("");
      } else {
        setName("");
        setHost("");
        setPort(22);
        setUser("");
        setAuthType("password");
        setPassword("");
        setKeyContent("");
        setKeyPass("");
      }
    }
  }, [open, editing]);

  if (!open) return null;

  const handleSave = async () => {
    if (!host || !user) {
      setSaveError("主机和用户名不能为空");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const cfg: app.ConnectionConfig = {
        id: editing?.id || "",
        name: name || host,
        host,
        port,
        user,
        authType,
        passwordEncrypted: authType === "password" ? password : "",
        keyEncrypted: authType === "key" ? keyContent : "",
        keyPassEncrypted: authType === "key" ? keyPass : "",
      };
      await onSave(cfg);
      onClose();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setKeyContent(String(reader.result || ""));
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? "编辑连接" : "新建连接"}</h2>
        <div className="field">
          <label>名称</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="可选" />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label>主机</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.1" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>端口</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 22)}
            />
          </div>
        </div>
        <div className="field">
          <label>用户名</label>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
        </div>
        <div className="field">
          <label>认证方式</label>
          <select value={authType} onChange={(e) => setAuthType(e.target.value as "password" | "key")}>
            <option value="password">密码</option>
            <option value="key">密钥</option>
          </select>
        </div>
        {authType === "password" ? (
          <div className="field">
            <label>密码{editing ? " (留空保持不变)" : ""}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label>私钥内容</label>
              <textarea
                value={keyContent}
                onChange={(e) => setKeyContent(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                rows={3}
                style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
              />
              <div style={{ marginTop: 4 }}>
                <button
                  className="icon"
                  onClick={() => document.getElementById("keyfile-input")?.click()}
                >
                  选择文件
                </button>
                <input id="keyfile-input" type="file" onChange={handleKeyFile} />
              </div>
            </div>
            <div className="field">
              <label>密钥口令 (可选)</label>
              <input
                type="password"
                value={keyPass}
                onChange={(e) => setKeyPass(e.target.value)}
                autoComplete="off"
              />
            </div>
          </>
        )}
        {saveError ? (
          <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 10, wordBreak: "break-all" }}>
            {saveError}
          </div>
        ) : null}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSave} disabled={saving || !host || !user}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

