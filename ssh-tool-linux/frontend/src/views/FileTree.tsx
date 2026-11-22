import { useState, useEffect, useCallback, useRef } from "react";
import * as App from "../../wailsjs/go/app/App";
import { EventsOn, EventsOff, OnFileDrop, OnFileDropOff } from "../../wailsjs/runtime/runtime";
import type { app } from "../../wailsjs/go/models";
import ContextMenu, { type MenuEntry } from "./ContextMenu";
import "./FileTree.css";

interface FNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: number;
  expanded: boolean;
  children: FNode[] | null;
}

interface FileTreeProps {
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

function joinPath(base: string, name: string): string {
  if (base.endsWith("/")) return base + name;
  return `${base}/${name}`;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i < 0) return ".";
  const head = p.slice(0, i);
  return head === "" ? "/" : head;
}

function flatten(node: FNode, depth: number, out: { node: FNode; depth: number }[]) {
  out.push({ node, depth });
  if (node.isDir && node.expanded && node.children) {
    for (const c of node.children) {
      flatten(c, depth + 1, out);
    }
  }
}

function updateNode(node: FNode, path: string, fn: (n: FNode) => FNode): FNode {
  if (node.path === path) return fn(node);
  if (!node.children) return node;
  return { ...node, children: node.children.map((c) => updateNode(c, path, fn)) };
}

function toNodes(entries: app.FileEntry[], base: string, keep?: FNode[] | null): FNode[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((e) => {
    const old = keep?.find((k) => k.name === e.name);
    return {
      name: e.name,
      path: joinPath(base, e.name),
      isDir: e.isDir,
      size: e.size,
      modTime: e.modTime,
      expanded: old?.expanded ?? false,
      children: old?.children ?? null,
    };
  });
}

interface MenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

export default function FileTree({ sessionID, toast, onEdit }: FileTreeProps) {
  const [rootBase, setRootBase] = useState<string>(".");
  const [root, setRoot] = useState<FNode | null>(null);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragover, setDragover] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);
  const uploadRef = useRef<(file: { name: string; path?: string }) => void>(() => undefined);

  const loadRoot = useCallback(
    async (base: string) => {
      if (!sessionID) return;
      setLoading(true);
      setError(null);
      try {
        const list = await App.SftpList(sessionID, base);
        const label = base === "." ? "~" : base;
        setRoot({
          name: label,
          path: base,
          isDir: true,
          size: 0,
          modTime: 0,
          expanded: true,
          children: toNodes(list || [], base, null),
        });
        setSelectedDir(base);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [sessionID],
  );

  useEffect(() => {
    if (sessionID) {
      loadRoot(rootBase);
    } else {
      setRoot(null);
    }
  }, [sessionID, rootBase, loadRoot]);

  const reloadDir = useCallback(
    async (path: string) => {
      if (!sessionID) return;
      try {
        const list = await App.SftpList(sessionID, path);
        setRoot((prev) =>
          prev ? updateNode(prev, path, (n) => ({ ...n, children: toNodes(list || [], path, n.children) })) : prev,
        );
      } catch (e) {
        toast.show("error", "刷新失败", String(e));
      }
    },
    [sessionID, toast],
  );

  const toggleDir = async (node: FNode) => {
    if (!node.isDir) {
      onEdit?.(node.path);
      return;
    }
    setSelectedDir(node.path);
    if (node.expanded) {
      setRoot((prev) => (prev ? updateNode(prev, node.path, (n) => ({ ...n, expanded: false })) : prev));
      return;
    }
    if (node.children === null) {
      try {
        const list = await App.SftpList(sessionID!, node.path);
        setRoot((prev) =>
          prev
            ? updateNode(prev, node.path, (n) => ({
                ...n,
                expanded: true,
                children: toNodes(list || [], node.path, n.children),
              }))
            : prev,
        );
      } catch (e) {
        toast.show("error", "读取目录失败", String(e));
      }
      return;
    }
    setRoot((prev) => (prev ? updateNode(prev, node.path, (n) => ({ ...n, expanded: true })) : prev));
  };

  const download = async (node: FNode) => {
    if (!sessionID || node.isDir) return;
    const localPath = await App.SaveFileDialog("下载到", node.name);
    if (!localPath) return;
    const jobID = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toastId = toast.show("info", "下载中", node.name);
    const event = `sftp:progress:${jobID}`;
    EventsOn(event, (written: number, total: number) => {
      const pct = total > 0 ? Math.round((written / total) * 100) : 0;
      toast.updateProgress(toastId, pct);
    });
    try {
      const n = await App.SftpDownload(sessionID, node.path, localPath, jobID);
      toast.done(toastId, "success", "下载完成", `${node.name} (${formatSize(n)})`);
    } catch (e) {
      toast.done(toastId, "error", "下载失败", String(e));
    } finally {
      EventsOff(event);
    }
  };

  const uploadFile = async (file: { name: string; path?: string }) => {
    if (!sessionID) return;
    const dir = selectedDir || rootBase;
    const remotePath = joinPath(dir, file.name);
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
      await reloadDir(dir);
    } catch (e) {
      toast.done(toastId, "error", "上传失败", String(e));
    } finally {
      EventsOff(event);
    }
  };
  uploadRef.current = uploadFile;

  useEffect(() => {
    if (!sessionID) return;
    const onFiles = (_x: number, _y: number, paths: string[]) => {
      paths.forEach((p) => uploadRef.current({ name: p.split(/[\\/]/).pop() || "file", path: p }));
    };
    OnFileDrop(onFiles, true);
    return () => OnFileDropOff();
  }, [sessionID]);

  const handleFilePick = async (dir?: string) => {
    const local = await App.OpenFileDialog("选择上传文件");
    if (!local) return;
    const name = local.split(/[\\/]/).pop() || "file";
    const prev = selectedDir;
    if (dir) setSelectedDir(dir);
    await uploadFile({ name, path: local });
    if (dir) setSelectedDir(prev);
  };

  const doRename = async (node: FNode) => {
    const val = renaming?.value.trim() || "";
    setRenaming(null);
    if (!sessionID || !val || val === node.name) return;
    try {
      await App.SftpRename(sessionID, node.path, joinPath(dirname(node.path), val));
      await reloadDir(dirname(node.path));
    } catch (e) {
      toast.show("error", "重命名失败", String(e));
    }
  };

  const doDelete = async (node: FNode) => {
    if (!sessionID) return;
    try {
      await App.SftpDelete(sessionID, node.path, node.isDir);
      await reloadDir(dirname(node.path));
      toast.show("success", "已删除", node.name);
    } catch (e) {
      toast.show("error", "删除失败", String(e));
    }
  };

  const doMkdir = async () => {
    const name = window.prompt("目录名");
    if (!name || !sessionID) return;
    const dir = selectedDir || rootBase;
    try {
      await App.SftpMkdir(sessionID, joinPath(dir, name));
      await reloadDir(dir);
    } catch (e) {
      toast.show("error", "新建目录失败", String(e));
    }
  };

  const doMkfile = async () => {
    const name = window.prompt("文件名");
    if (!name || !sessionID) return;
    const dir = selectedDir || rootBase;
    try {
      await App.SftpMkfile(sessionID, joinPath(dir, name));
      await reloadDir(dir);
    } catch (e) {
      toast.show("error", "新建文件失败", String(e));
    }
  };

  const onRowContextMenu = (e: React.MouseEvent, node: FNode) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuEntry[] = node.isDir
      ? [
          {
            label: node.expanded ? "收起" : "展开",
            icon: "📁",
            onClick: () => toggleDir(node),
          },
          { label: "上传到这里", icon: "⬆", onClick: () => handleFilePick(node.path) },
          { label: "新建目录", icon: "📁", onClick: () => { setSelectedDir(node.path); doMkdir(); } },
          { label: "新建文件", icon: "📄", onClick: () => { setSelectedDir(node.path); doMkfile(); } },
          { divider: true },
          {
            label: "重命名",
            icon: "✎",
            onClick: () => setRenaming({ path: node.path, value: node.name }),
          },
          { label: "删除", icon: "🗑", danger: true, onClick: () => doDelete(node) },
        ]
      : [
          { label: "编辑", icon: "✎", onClick: () => onEdit?.(node.path) },
          { label: "下载", icon: "⬇", onClick: () => download(node) },
          { divider: true },
          {
            label: "重命名",
            icon: "✎",
            onClick: () => setRenaming({ path: node.path, value: node.name }),
          },
          { label: "删除", icon: "🗑", danger: true, onClick: () => doDelete(node) },
        ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onBlankContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "上传文件", icon: "⬆", onClick: () => handleFilePick() },
        { label: "新建目录", icon: "📁", onClick: doMkdir },
        { label: "新建文件", icon: "📄", onClick: doMkfile },
        { divider: true },
        { label: "刷新", icon: "⟳", onClick: () => root && reloadDir(root.path) },
      ],
    });
  };

  if (!sessionID) {
    return (
      <aside className="file-sidebar">
        <div className="file-tree-header">文件</div>
        <div className="file-tree-empty">未连接,建立连接后可浏览远程文件</div>
      </aside>
    );
  }

  const rows: { node: FNode; depth: number }[] = [];
  if (root) flatten(root, 0, rows);

  return (
    <aside
      className={`file-sidebar ${dragover ? "dragover" : ""}`}
      style={{ "--wails-drop-target": "true" } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
      }}
      onContextMenu={onBlankContextMenu}
    >
      <div className="file-tree-header">
        <span className="file-tree-title">文件</span>
        <button
          className="icon"
          title={rootBase === "." ? "切换到根目录 /" : "切换到家目录 ~"}
          onClick={() => setRootBase((b) => (b === "." ? "/" : "."))}
        >
          {rootBase === "." ? "~" : "/"}
        </button>
        <button className="icon" title="上传文件" onClick={() => handleFilePick()}>
          ⬆
        </button>
        <button className="icon" title="新建目录" onClick={doMkdir}>
          📁+
        </button>
        <button className="icon" title="新建文件" onClick={doMkfile}>
          📄+
        </button>
        <button className="icon" title="刷新" onClick={() => root && reloadDir(root.path)}>
          ⟳
        </button>
      </div>
      {error ? <div className="file-tree-error">{error}</div> : null}
      <div className="file-tree-body">
        {loading && !root ? (
          <div className="file-tree-empty">加载中...</div>
        ) : (
          rows.map(({ node, depth }) =>
            renaming?.path === node.path ? (
              <div key={node.path} className="tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
                <span className="tree-icon">{node.isDir ? "▸" : "·"}</span>
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ path: node.path, value: e.target.value })}
                  onBlur={() => doRename(node)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doRename(node);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              </div>
            ) : (
              <div
                key={node.path}
                className={`tree-row ${selectedDir === node.path ? "selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                title={node.isDir ? node.path : `${node.path} (${formatSize(node.size)})`}
                onClick={() => toggleDir(node)}
                onContextMenu={(e) => onRowContextMenu(e, node)}
              >
                <span className="tree-icon">
                  {node.isDir ? (node.expanded ? "▾" : "▸") : "·"}
                </span>
                <span className={`tree-name ${node.isDir ? "dir" : "file"}`}>{node.name}</span>
                {!node.isDir ? <span className="tree-size">{formatSize(node.size)}</span> : null}
              </div>
            ),
          )
        )}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </aside>
  );
}
