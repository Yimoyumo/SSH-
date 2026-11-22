import { useEffect } from "react";
import type { TerminalTab } from "../hooks/useSSH";
import TerminalView from "./Terminal";
import "./TerminalTabs.css";

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTabID: string | null;
  fontSize: number;
  fontFamily: string;
  onClose: (id: string) => void;
  onNewTerminal: () => void;
  onNewConnection: () => void;
}

export default function TerminalTabs({
  tabs,
  activeTabID,
  fontSize,
  fontFamily,
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
    <div className="content">
      {tabs.length === 0 ? (
        <div className="empty-state">
          <div>没有打开的终端</div>
          <div className="hint">点左上角 ＋ 选择服务器,或 Ctrl+T 新开(Ctrl+Shift+W 关闭)</div>
          <button className="primary" onClick={onNewConnection}>
            新建连接
          </button>
        </div>
      ) : (
        tabs.map((tab) => (
          <div
            key={tab.terminalID}
            className="content-panel"
            style={{ display: activeTabID === tab.terminalID ? "flex" : "none" }}
          >
            <TerminalView
              terminalID={tab.terminalID}
              visible={activeTabID === tab.terminalID}
              fontSize={fontSize}
              fontFamily={fontFamily}
            />
          </div>
        ))
      )}
    </div>
  );
}
