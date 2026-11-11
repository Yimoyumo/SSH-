import { useState, useEffect, useCallback, useRef } from "react";
import * as App from "../../wailsjs/go/app/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import type { app } from "../../wailsjs/go/models";
import ContextMenu, { type MenuEntry } from "./ContextMenu";
import "./FilePanel.css";

interface FilePanelProps {
  sessionID: string | null;
  toast: ReturnType<typeof import("./Toast").useToast>;
  onEdit?: (remotePath: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

export default function FilePanel({ sessionID, toast, onEdit }: FilePanelProps) {
  const [path, setPath] = useState("/root");
  const [entries, setEntries] = useState<app.FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const pathInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (dir: string) => {
    if (!sessionID) return;
    setLoading(true);
    setError(null);
    try {
      const list = await App.SftpList(sessionID, dir);
      list.sort((a: app.FileEntry, b: app.FileEntry) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(list || []);
      setPath(dir);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionID]);

  useEffect(() => {
    if (sessionID) {
      loadDir(path);
    }
  }, [sessionID]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinPath = (name: string) => (path.endsWith("/") ? path + name : path + "/" + name);

  const goParent = () => {
    if (path === "/" || path === "") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    loadDir("/" + parts.join("/"));
  };

  const goPath = () => {
    const v = pathInputRef.current?.value.trim();
    if (v) loadDir(v);
  };

  const enterDir = (name: string) => loadDir(joinPath(name));

  const download = async (entry: app.FileEntry) => {
    if (!sessionID || entry.isDir) return;
    const remotePath = joinPath(entry.name);
    const localPath = await App.SaveFileDialog("下载到", entry.name);
    if (!localPath) return;
    const jobID = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toastId = toast.show("info", "下载中", entry.name);
    const event = `sftp:progress:${jobID}`;
    EventsOn(event, (written: number, total: number) => {
      const pct = total > 0 ? Math.round((written / total) * 100) : 0;
      toast.updateProgress(toastId, pct);
    });
    try {
      const n = await App.SftpDownload(sessionID, remotePath, localPath, jobID);
      toast.done(toastId, "success", "下载完成", `${entry.name} (${formatSize(n)})`);
    } catch (e) {
      toast.done(toastId, "error", "下载失败", String(e));
    } finally {
      EventsOff(event);
    }
  };

  const doRename = async (oldName: string) => {
    if (!sessionID || !renameVal.trim() || renameVal === oldName) {
      setRenaming(null);
      return;
    }
    try {
      await App.SftpRename(sessionID, joinPath(oldName), joinPath(renameVal.trim()));
      await loadDir(path);
    } catch (e) {
      toast.show("error", "重命名失败", String(e));
    }
    setRenaming(null);
  };

  const doDelete = async (entry: app.FileEntry) => {
    if (!sessionID) return;
    try {
      await App.SftpDelete(sessionID, joinPath(entry.name), entry.isDir);
      await loadDir(path);
      toast.show("success", "已删除", entry.name);
    } catch (e) {
      toast.show("error", "删除失败", String(e));
    }
  };

  const doMkdir = async () => {
    const name = window.prompt("目录名");
    if (!name || !sessionID) return;
    try {
      await App.SftpMkdir(sessionID, joinPath(name));
      await loadDir(path);
    } catch (e) {
      toast.show("error", "新建目录失败", String(e));
    }
  };

  const doMkfile = async () => {
    const name = window.prompt("文件名");
    if (!name || !sessionID) return;
    try {
      await App.SftpMkfile(sessionID, joinPath(name));
      await loadDir(path);
      toast.show("success", "已新建", name);
    } catch (e) {
      toast.show("error", "新建文件失败", String(e));
    }
  };

  const uploadFile = async (file: { name: string; path?: string }) => {
    if (!sessionID) return;
    const remotePath = joinPath(file.name);
    const jobID = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toastId = toast.show("info", "上传中", file.name);
    const event = `sftp:progress:${jobID}`;
    EventsOn(event, (written: number, total: number) => {
      const pct = total > 0 ? Math.round((written / total) * 100) : 0;
      toast.updateProgress(toastId, pct);
    });
    try {
      const localPath = file.path || "";
      if (!localPath) {
        throw new Error("无法获取本地文件路径");
      }
      const n = await App.SftpUploadLocalFile(sessionID, localPath, remotePath, jobID);
      toast.done(toastId, "success", "上传完成", `${file.name} (${formatSize(n)})`);
      await loadDir(path);
    } catch (e) {
      toast.done(toastId, "error", "上传失败", String(e));
    } finally {
      EventsOff(event);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((f) => uploadFile({ name: f.name, path: (f as unknown as { path?: string }).path }));
  };

  const handleFilePick = async () => {
    const local = await App.OpenFileDialog("选择上传文件");
    if (!local) return;
    const name = local.split(/[\\/]/).pop() || "file";
    uploadFile({ name, path: local });
  };

  const onRowContextMenu = (e: React.MouseEvent, entry: app.FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuEntry[] = entry.isDir
      ? [
          { label: "进入", icon: "📁", onClick: () => enterDir(entry.name) },
          { label: "重命名", icon: "✎", onClick: () => { setRenaming(entry.name); setRenameVal(entry.name); } },
          { divider: true },
          { label: "删除", icon: "🗑", danger: true, onClick: () => doDelete(entry) },
        ]
      : [
          { label: "下载", icon: "⬇", onClick: () => download(entry) },
          { label: "编辑", icon: "✎", onClick: () => onEdit?.(joinPath(entry.name)) },
          { label: "重命名", icon: "✎", onClick: () => { setRenaming(entry.name); setRenameVal(entry.name); } },
          { divider: true },
          { label: "删除", icon: "🗑", danger: true, onClick: () => doDelete(entry) },
        ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "上传文件", icon: "⬆", onClick: handleFilePick },
        { label: "新建目录", icon: "📁", onClick: doMkdir },
        { label: "新建文件", icon: "📄", onClick: doMkfile },
        { divider: true },
        { label: "刷新", icon: "⟳", onClick: () => loadDir(path) },
      ],
    });
  };

  if (!sessionID) {
    return (
      <div className="empty-state">
        <div>未连接</div>
        <div className="hint">先在终端建立连接</div>
      </div>
    );
  }

  return (
    <div
      className="file-drop-zone"
      style={{ borderStyle: dragover ? "solid" : "none" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
      onContextMenu={onBlankContextMenu}
    >
      <div className="file-toolbar" onContextMenu={(e) => e.stopPropagation()}>
        <button className="icon" onClick={goParent} title="上级目录">
          ↑
        </button>
        <button className="icon" onClick={() => loadDir(path)} title="刷新">
          ⟳
        </button>
        <input
          ref={pathInputRef}
          className="path-input"
          defaultValue={path}
          onKeyDown={(e) => {
            if (e.key === "Enter") goPath();
          }}
        />
        <button onClick={handleFilePick} title="上传">
          ⬆ 上传
        </button>
      </div>
      {error ? (
        <div style={{ padding: "12px 16px", color: "var(--danger)", fontSize: 12 }}>{error}</div>
      ) : null}
      <div className="file-list">
        {loading ? (
          <div style={{ padding: "16px", color: "var(--text-dim)" }}>加载中...</div>
        ) : (
          entries.map((entry) =>
            renaming === entry.name ? (
              <div key={entry.name} className="file-row">
                <span className="file-icon">{entry.isDir ? "📁" : "📄"}</span>
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => doRename(entry.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doRename(entry.name);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  style={{ flex: 1, fontSize: 12 }}
                />
              </div>
            ) : (
              <div
                key={entry.name}
                className="file-row"
                onClick={() => entry.isDir && enterDir(entry.name)}
                onDoubleClick={() => entry.isDir && enterDir(entry.name)}
                onContextMenu={(e) => onRowContextMenu(e, entry)}
              >
                <span className="file-icon">{entry.isDir ? "📁" : "📄"}</span>
                <span className="file-name">{entry.name}</span>
                <span className="file-size">{entry.isDir ? "-" : formatSize(entry.size)}</span>
                <span className="file-time">{formatTime(entry.modTime)}</span>
              </div>
            )
          )
        )}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
