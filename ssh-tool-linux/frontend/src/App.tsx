import { useState, useEffect } from "react";
import { useSSH } from "./hooks/useSSH";
import ConnectionList from "./views/ConnectionList";
import TerminalTabs from "./views/TerminalTabs";
import FilePanel from "./views/FilePanel";
import ConnectDialog from "./views/ConnectDialog";
import TextEditor from "./views/TextEditor";
import { useToast, ToastContainer } from "./views/Toast";
import type { app } from "../wailsjs/go/models";

type PanelType = "terminal" | "file";

export default function App() {
  const ssh = useSSH();
  const toast = useToast();
  const [panel, setPanel] = useState<PanelType>("terminal");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<app.ConnectionConfig | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ sessionID: string; remotePath: string } | null>(null);

  useEffect(() => {
    ssh.refreshConnections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = (cfg: app.ConnectionConfig) => {
    ssh.openTerminal(cfg);
    setPanel("terminal");
  };

  const handleNewConnection = () => {
    setEditing(null);
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

  const handleEdit = (cfg: app.ConnectionConfig) => {
    setEditing(cfg);
    setDialogOpen(true);
  };

  const handleSave = async (cfg: app.ConnectionConfig): Promise<string> => {
    return ssh.saveConnection(cfg);
  };

  const activeTab = ssh.tabs.find((t) => t.terminalID === ssh.activeTabID);
  const activeSessionID = activeTab?.sessionID || null;
  const activeConfig = activeSessionID ? ssh.sessions.get(activeSessionID)?.config : undefined;

  return (
    <div className="app-layout">
      <ConnectionList
        connections={ssh.connections}
        activeSessionHost={activeConfig?.host}
        onConnect={handleConnect}
        onEdit={handleEdit}
        onDelete={ssh.deleteConnection}
        onNew={handleNewConnection}
        connecting={ssh.connecting}
      />
      <div className="main">
        <div className="panel-switch">
          <button
            className={panel === "terminal" ? "active" : ""}
            onClick={() => setPanel("terminal")}
          >
            终端
          </button>
          <button className={panel === "file" ? "active" : ""} onClick={() => setPanel("file")}>
            文件
          </button>
        </div>
        {ssh.error ? (
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(241,76,76,0.12)",
              color: "var(--danger)",
              fontSize: 12,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              wordBreak: "break-all",
            }}
          >
            <span>{ssh.error}</span>
            <button className="icon" onClick={ssh.clearError} title="关闭">
              ×
            </button>
          </div>
        ) : null}
        {panel === "terminal" ? (
          <TerminalTabs
            tabs={ssh.tabs}
            activeTabID={ssh.activeTabID}
            onSelect={ssh.setActiveTabID}
            onClose={ssh.closeTab}
            onNewTerminal={handleNewTerminal}
            onNewConnection={handleNewConnection}
          />
        ) : (
          <div className="content">
            <div className="content-panel">
              <FilePanel
                sessionID={activeSessionID}
                toast={toast}
                onEdit={(remotePath) => {
                  if (activeSessionID) setEditorTarget({ sessionID: activeSessionID, remotePath });
                }}
              />
            </div>
          </div>
        )}
      </div>
      <ConnectDialog
        open={dialogOpen}
        editing={editing}
        onSave={handleSave}
        onClose={() => setDialogOpen(false)}
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
