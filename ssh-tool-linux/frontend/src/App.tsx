import { useState, useEffect } from "react";
import { useSSH } from "./hooks/useSSH";
import { resolveTerminalFont, FALLBACK_FONT, registerFont } from "./fonts";
import SessionList from "./views/SessionList";
import TerminalTabs from "./views/TerminalTabs";
import FileTree from "./views/FileTree";
import TitleBar from "./views/TitleBar";
import SettingsDialog, { type SettingsValue } from "./views/SettingsDialog";
import ConnectDialog from "./views/ConnectDialog";
import TextEditor from "./views/TextEditor";
import { useToast, ToastContainer } from "./views/Toast";
import * as AppAPI from "../wailsjs/go/app/App";
import type { app } from "../wailsjs/go/models";

export default function App() {
  const ssh = useSSH();
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsValue>({
    terminalFontSize: 14,
    terminalFontFamily: "Ubuntu Sans Mono",
    windowStyle: "custom",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileSidebarOpen, setFileSidebarOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<app.ConnectionConfig | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ sessionID: string; remotePath: string } | null>(null);

  useEffect(() => {
    const boot = async () => {
      ssh.refreshConnections();
      try {
        const fonts = await AppAPI.ListCustomFonts();
        await Promise.all(
          fonts.map((f: { family: string; data: string }) =>
            registerFont(f.family, f.data).catch(() => undefined),
          ),
        );
      } catch {
        // 自定义字体加载失败不阻塞启动,后续按缺失字体回退
      }
      try {
        const s = await AppAPI.GetSettings();
        const next: SettingsValue = {
          terminalFontSize: s.terminalFontSize,
          terminalFontFamily: s.terminalFontFamily,
          windowStyle: s.windowStyle,
        };
        if (s.terminalFontFamily !== resolveTerminalFont(s.terminalFontFamily)) {
          next.terminalFontFamily = FALLBACK_FONT;
          toast.show("info", "终端字体", `${s.terminalFontFamily} 未安装或非等宽,已回退 ${FALLBACK_FONT}`);
          AppAPI.SaveSettings(next).catch((e: unknown) =>
            toast.show("error", "设置保存失败", String(e)),
          );
        }
        setSettings(next);
      } catch (e) {
        toast.show("error", "设置加载失败", String(e));
      }
    };
    boot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applySettings = (v: SettingsValue) => {
    if (v.windowStyle !== settings.windowStyle) {
      toast.show("info", "窗口样式", "重启应用后生效");
    }
    setSettings(v);
    AppAPI.SaveSettings(v).catch((e: unknown) => toast.show("error", "设置保存失败", String(e)));
  };

  const handleDownloadFont = (family: string) => {
    toast.show("info", "下载字体", `${family} ...`);
    AppAPI.DownloadFont(family)
      .then(async (cf: { family: string; data: string }) => {
        await registerFont(cf.family, cf.data);
        applySettings({ ...settings, terminalFontFamily: family });
        toast.show("success", "字体已就绪", `${family} 下载并启用`);
      })
      .catch((e: unknown) => toast.show("error", "字体下载失败", String(e)));
  };

  const handleConnect = (cfg: app.ConnectionConfig) => {
    ssh.openTerminal(cfg);
  };

  const handleNewConnection = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEditConnection = (cfg: app.ConnectionConfig) => {
    setEditing(cfg);
    setDialogOpen(true);
  };

  const handleNewTerminal = () => {
    const activeTab = ssh.tabs.find((t) => t.terminalID === ssh.activeTabID);
    if (activeTab) {
      const sess = ssh.sessions.get(activeTab.sessionID);
      if (sess) {
        ssh.openTerminal(sess.config);
        return;
      }
    }
    if (ssh.connections.length > 0) {
      ssh.openTerminal(ssh.connections[0]);
      return;
    }
    handleNewConnection();
  };

  const activeTab = ssh.tabs.find((t) => t.terminalID === ssh.activeTabID);
  const activeSessionID = activeTab?.sessionID || null;
  const activeConfig = activeSessionID ? ssh.sessions.get(activeSessionID)?.config : undefined;
  const title = activeConfig
    ? `${activeConfig.user}@${activeConfig.host}${activeTab?.title ? ` — ${activeTab.title}` : ""}`
    : "SSH 工具";

  return (
    <div className="app-shell">
      <TitleBar
        title={title}
        showWindowControls={settings.windowStyle === "custom"}
        fileSidebarOpen={fileSidebarOpen}
        onToggleFiles={() => setFileSidebarOpen((v) => !v)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-body">
        <SessionList
          tabs={ssh.tabs}
          activeTabID={ssh.activeTabID}
          sessions={ssh.sessions}
          connections={ssh.connections}
          connecting={ssh.connecting}
          onSelect={ssh.setActiveTabID}
          onClose={ssh.closeTab}
          onConnect={handleConnect}
          onNewConnection={handleNewConnection}
        />
        <div className="terminal-pane">
          <TerminalTabs
            tabs={ssh.tabs}
            activeTabID={ssh.activeTabID}
            fontSize={settings.terminalFontSize}
            fontFamily={settings.terminalFontFamily}
            onClose={ssh.closeTab}
            onNewTerminal={handleNewTerminal}
            onNewConnection={handleNewConnection}
          />
        </div>
        {fileSidebarOpen ? (
          <FileTree
            sessionID={activeSessionID}
            toast={toast}
            onEdit={(remotePath) => {
              if (activeSessionID) setEditorTarget({ sessionID: activeSessionID, remotePath });
            }}
          />
        ) : null}
      </div>
      <ConnectDialog
        open={dialogOpen}
        editing={editing}
        onSave={(cfg) => ssh.saveConnection(cfg)}
        onClose={() => setDialogOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={applySettings}
        connections={ssh.connections}
        onEditConnection={(cfg) => {
          setSettingsOpen(false);
          handleEditConnection(cfg);
        }}
        onDeleteConnection={ssh.deleteConnection}
        onNewConnection={() => {
          setSettingsOpen(false);
          handleNewConnection();
        }}
        onDownloadFont={handleDownloadFont}
        onClose={() => setSettingsOpen(false)}
      />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      {editorTarget ? (
        <TextEditor
          sessionID={editorTarget.sessionID}
          remotePath={editorTarget.remotePath}
          toast={toast}
          onClose={() => setEditorTarget(null)}
        />
      ) : null}
    </div>
  );
}
