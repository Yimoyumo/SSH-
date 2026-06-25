import { useState } from "react";
import type { app } from "../../wailsjs/go/models";

interface ConnectionListProps {
  connections: app.ConnectionConfig[];
  activeSessionHost?: string;
  onConnect: (cfg: app.ConnectionConfig) => void;
  onEdit: (cfg: app.ConnectionConfig) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  connecting: boolean;
}

export default function ConnectionList({
  connections,
  activeSessionHost,
  onConnect,
  onEdit,
  onDelete,
  onNew,
  connecting,
}: ConnectionListProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {collapsed ? null : <span className="sidebar-title">连接</span>}
        <button
          className="icon collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "展开" : "收起"}
          disabled={connecting}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <div className="sidebar-list">
        {connections.length === 0 ? (
          collapsed ? null : (
            <div style={{ padding: "16px", color: "var(--text-dim)", fontSize: "12px" }}>
              暂无连接,点击 + 新建
            </div>
          )
        ) : (
          connections.map((cfg) => (
            <div
              key={cfg.id}
              className={`conn-item ${activeSessionHost === cfg.host ? "active" : ""}`}
              onClick={() => onConnect(cfg)}
              onDoubleClick={() => onConnect(cfg)}
              title={collapsed ? `${cfg.name || cfg.host} (${cfg.user}@${cfg.host}:${cfg.port || 22})` : undefined}
            >
              <span style={{ fontSize: "14px" }}></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="conn-name">{cfg.name || cfg.host}</div>
                <div className="conn-host">
                  {cfg.user}@{cfg.host}:{cfg.port || 22}
                </div>
              </div>
              <div className="conn-actions">
                <button
                  className="icon"
                  title="编辑"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(cfg);
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon"
                  title="删除"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`删除连接「${cfg.name || cfg.host}」?`)) {
                      onDelete(cfg.id);
                    }
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="sidebar-footer">
        <button className="icon" onClick={onNew} title="新建连接" disabled={connecting} style={{ width: "100%" }}>
          {collapsed ? "+" : "+ 新建连接"}
        </button>
      </div>
    </div>
  );
}
