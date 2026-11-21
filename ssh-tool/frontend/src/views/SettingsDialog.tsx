import type { app } from "../../wailsjs/go/models";
import { isMonospaceFamily, DOWNLOADABLE_FONTS } from "../fonts";
import "./SettingsDialog.css";

export interface SettingsValue {
  terminalFontSize: number;
  terminalFontFamily: string;
  windowStyle: string;
}

interface SettingsDialogProps {
  open: boolean;
  settings: SettingsValue;
  onChange: (v: SettingsValue) => void;
  connections: app.ConnectionConfig[];
  onEditConnection: (cfg: app.ConnectionConfig) => void;
  onDeleteConnection: (id: string) => void;
  onNewConnection: () => void;
  onDownloadFont: (family: string) => void;
  onClose: () => void;
}

// 预设覆盖双平台:Consolas/Cascadia Mono 为 Windows 自带,
// Ubuntu Sans Mono 等为 Linux 侧默认;不存在的字体按系统回退判定。
const FONT_PRESETS = [
  "Consolas",
  "Cascadia Mono",
  "Ubuntu Sans Mono",
  "Noto Sans Mono CJK SC",
  "Noto Sans Mono",
  "DejaVu Sans Mono",
  "JetBrains Mono",
  "Fira Code",
  "monospace",
];

export default function SettingsDialog({
  open,
  settings,
  onChange,
  connections,
  onEditConnection,
  onDeleteConnection,
  onNewConnection,
  onDownloadFont,
  onClose,
}: SettingsDialogProps) {
  if (!open) return null;

  const handleFontChange = (family: string) => {
    if (!isMonospaceFamily(family) && DOWNLOADABLE_FONTS.includes(family)) {
      if (confirm(`「${family}」未安装,是否下载并启用?`)) {
        onDownloadFont(family);
      }
      return;
    }
    onChange({ ...settings, terminalFontFamily: family });
  };

  return (
    <div className="modal-overlay">
      <div className="modal settings-modal">
        <div className="settings-head">
          <h2>设置</h2>
          <button className="icon" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">终端</div>
          <div className="settings-row">
            <label>字体大小</label>
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={settings.terminalFontSize}
              onChange={(e) => onChange({ ...settings, terminalFontSize: Number(e.target.value) })}
            />
            <span className="settings-value">{settings.terminalFontSize}</span>
          </div>
          <div className="settings-row">
            <label>字体样式</label>
            <select
              value={settings.terminalFontFamily}
              onChange={(e) => handleFontChange(e.target.value)}
            >
              {FONT_PRESETS.map((f) => {
                const ok = isMonospaceFamily(f);
                const downloadable = DOWNLOADABLE_FONTS.includes(f);
                return (
                  <option key={f} value={f} disabled={!ok && !downloadable}>
                    {ok ? f : downloadable ? `${f} (未安装,点击下载)` : `${f} (未安装)`}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">窗口</div>
          <div className="settings-row">
            <label>窗口样式</label>
            <select
              value={settings.windowStyle}
              onChange={(e) => onChange({ ...settings, windowStyle: e.target.value })}
            >
              <option value="custom">自定义标题栏</option>
              <option value="system">系统标题栏</option>
            </select>
            <span className="settings-note">重启应用后生效</span>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">
            服务器信息
            <button className="settings-add" onClick={onNewConnection}>
              ＋ 新建
            </button>
          </div>
          {connections.length === 0 ? (
            <div className="settings-empty">暂无保存的服务器</div>
          ) : (
            <div className="settings-conn-list">
              {connections.map((cfg) => (
                <div key={cfg.id} className="settings-conn-row">
                  <div className="settings-conn-info">
                    <div className="settings-conn-name">{cfg.name || cfg.host}</div>
                    <div className="settings-conn-sub">
                      {cfg.user}@{cfg.host}:{cfg.port || 22} · {cfg.authType === "key" ? "密钥" : "密码"}
                    </div>
                  </div>
                  <button className="icon" title="编辑" onClick={() => onEditConnection(cfg)}>
                    ✎
                  </button>
                  <button
                    className="icon danger-text"
                    title="删除"
                    onClick={() => {
                      if (confirm(`删除连接「${cfg.name || cfg.host}」?`)) {
                        onDeleteConnection(cfg.id);
                      }
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
