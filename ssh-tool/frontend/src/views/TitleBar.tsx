import { WindowMinimise, WindowToggleMaximise, Quit } from "../../wailsjs/runtime/runtime";
import "./TitleBar.css";

interface TitleBarProps {
  title: string;
  showWindowControls: boolean;
  fileSidebarOpen: boolean;
  onToggleFiles: () => void;
  onOpenSettings: () => void;
}

export default function TitleBar({
  title,
  showWindowControls,
  fileSidebarOpen,
  onToggleFiles,
  onOpenSettings,
}: TitleBarProps) {
  return (
    <header className="titlebar" style={{ "--wails-draggable": "drag" } as React.CSSProperties}>
      <div className="titlebar-title">{title}</div>
      <div
        className="titlebar-actions"
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        <button
          className={`icon ${fileSidebarOpen ? "active" : ""}`}
          onClick={onToggleFiles}
          title="文件侧栏"
        >
          ▤
        </button>
        <button className="icon" onClick={onOpenSettings} title="设置">
          ⚙
        </button>
        {showWindowControls ? (
          <>
            <button className="win-btn" onClick={() => WindowMinimise()} title="最小化">
              ─
            </button>
            <button className="win-btn" onClick={() => WindowToggleMaximise()} title="最大化">
              ▢
            </button>
            <button className="win-btn close" onClick={() => Quit()} title="关闭">
              ✕
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
