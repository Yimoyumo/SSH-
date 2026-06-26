import { useEffect } from "react";
import type { TerminalTab } from "../hooks/useSSH";
import TerminalView from "./Terminal";
import "./TerminalTabs.css";

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabID: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTerminal: () => void;
  onNewConnection: () => void;
}

export default function TerminalTabs({
  tabs,
  activeTabID,
  onSelect,
  onClose,
  onNewTerminal,
  onNewConnection,
}: TerminalTabsProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "t") {
        e.preventDefault();
        onNewTerminal();
      } else if (e.ctrlKey && e.shiftKey && e.key === "W") {
        e.preventDefault();
        if (activeTabID) onClose(activeTabID);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabID, onNewTerminal, onClose]);

  return (
    <>
      <div className="tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.terminalID}
            className={`tab ${activeTabID === tab.terminalID ? "active" : ""}`}
            onClick={() => onSelect(tab.terminalID)}
          >
            <span className="tab-title">{tab.title}</span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.terminalID);
              }}
            >
              ×
            </span>
          </div>
        ))}
        <div className="tab-add" onClick={onNewTerminal} title="新开终端 (Ctrl+T)">
          +
        </div>
        <div className="tab-add" onClick={onNewConnection} title="新建连接" style={{ marginLeft: "auto" }}>
          ⛁
        </div>
      </div>
      <div className="content">
        {tabs.length === 0 ? (
          <div className="empty-state">
            <div>没有打开的终端</div>
            <div className="hint">点击左侧连接或按 Ctrl+T 新开(Ctrl+Shift+W 关闭)</div>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.terminalID}
              className="content-panel"
              style={{ display: activeTabID === tab.terminalID ? "flex" : "none" }}
            >
              <TerminalView terminalID={tab.terminalID} visible={activeTabID === tab.terminalID} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

