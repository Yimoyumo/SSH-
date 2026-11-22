import { useState } from "react";
import type { app } from "../../wailsjs/go/models";
import type { TerminalTab, SessionState } from "../hooks/useSSH";
import "./SessionList.css";

interface SessionListProps {
  tabs: TerminalTab[];
  activeTabID: string | null;
  sessions: Map<string, SessionState>;
  connections: app.ConnectionConfig[];
  connecting: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onConnect: (cfg: app.ConnectionConfig) => void;
  onNewConnection: () => void;
}

export default function SessionList({
  tabs,
  activeTabID,
  sessions,
  connections,
  connecting,
  onSelect,
  onClose,
  onConnect,
  onNewConnection,
}: SessionListProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <aside className="session-sidebar">
      <div className="session-header">
        <button
          className="icon"
          title="新建终端/连接"
          disabled={connecting}
          onClick={() => setPickerOpen((v) => !v)}
        >
          ＋
        </button>
        <div className="session-header-title">会话</div>
        {pickerOpen ? (
          <div className="session-picker">
            {connections.length === 0 ? (
              <div className="session-picker-empty">暂无已保存的服务器</div>
            ) : (
              connections.map((cfg) => (
                <div
                  key={cfg.id}
                  className="session-picker-item"
                  onClick={() => {
                    setPickerOpen(false);
                    onConnect(cfg);
                  }}
                >
                  <span className="picker-name">{cfg.name || cfg.host}</span>
                  <span className="picker-sub">
                    {cfg.user}@{cfg.host}:{cfg.port || 22}
                  </span>
                </div>
              ))
            )}
            <div className="session-picker-divider" />
            <div
              className="session-picker-item"
              onClick={() => {
                setPickerOpen(false);
                onNewConnection();
              }}
            >
              <span className="picker-name">新建连接…</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="session-list" onClick={() => pickerOpen && setPickerOpen(false)}>
        {tabs.length === 0 ? (
          <div className="session-empty">暂无会话,点 ＋ 新建</div>
        ) : (
          tabs.map((tab) => {
            const sess = sessions.get(tab.sessionID);
            const cfg = sess?.config;
            return (
              <div
                key={tab.terminalID}
                className={`session-item ${activeTabID === tab.terminalID ? "active" : ""}`}
                onClick={() => onSelect(tab.terminalID)}
              >
                <span className="session-grip">⠿</span>
                <div className="session-info">
                  <div className="session-name">{tab.title}</div>
                  <div className="session-sub">
                    {cfg ? `${cfg.user}@${cfg.host}:${cfg.port || 22}` : ""}
                  </div>
                </div>
                <button
                  className="icon session-close"
                  title="关闭"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.terminalID);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
