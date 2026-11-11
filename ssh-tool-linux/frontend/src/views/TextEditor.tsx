import { useState, useEffect, useCallback } from "react";
import * as App from "../../wailsjs/go/app/App";
import "./TextEditor.css";

interface TextEditorProps {
  sessionID: string;
  remotePath: string;
  onClose: () => void;
  onSaved?: () => void;
  toast: ReturnType<typeof import("./Toast").useToast>;
}

export default function TextEditor({ sessionID, remotePath, onClose, onSaved, toast }: TextEditorProps) {
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    App.SftpReadText(sessionID, remotePath)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setDraft(text);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionID, remotePath]);

  const dirty = draft !== content;

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await App.SftpWriteText(sessionID, remotePath, draft);
      setContent(draft);
      toast.show("success", "已保存", remotePath.split("/").pop() || remotePath);
      onSaved?.();
    } catch (e) {
      toast.show("error", "保存失败", String(e));
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, draft, sessionID, remotePath, toast, onSaved]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("有未保存的更改,确定关闭?")) return;
    onClose();
  }, [dirty, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  };

  const fileName = remotePath.split("/").pop() || remotePath;

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div
        className="modal editor-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="editor-toolbar">
          <span className="editor-title" title={remotePath}>
            {fileName}
            {dirty ? <span className="editor-dirty"> *</span> : null}
          </span>
          <span className="editor-path">{remotePath}</span>
          <div className="editor-actions">
            <button
              className="primary"
              onClick={save}
              disabled={!dirty || saving || loading || !!loadError}
              title="Ctrl+S"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button onClick={requestClose} title="关闭">
              关闭
            </button>
          </div>
        </div>
        <div className="editor-body">
          {loading ? (
            <div className="editor-hint">加载中...</div>
          ) : loadError ? (
            <div className="editor-error">{loadError}</div>
          ) : (
            <textarea
              className="editor-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoFocus
              placeholder="文件为空"
            />
          )}
        </div>
      </div>
    </div>
  );
}
