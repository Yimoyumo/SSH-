import { useState, useCallback } from "react";
import * as App from "../../wailsjs/go/app/App";
import { app } from "../../wailsjs/go/models";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

export interface TerminalTab {
  terminalID: string;
  sessionID: string;
  title: string;
}

export interface SessionState {
  sessionID: string;
  config: app.ConnectionConfig;
}

export function useSSH() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabID, setActiveTabID] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [connections, setConnections] = useState<app.ConnectionConfig[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConnections = useCallback(async () => {
    try {
      const list = await App.ListConnections();
      setConnections(list || []);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const openTerminal = useCallback(async (cfg: app.ConnectionConfig) => {
    setConnecting(true);
    setError(null);
    try {
      let sessionID = "";
      for (const [, s] of sessions) {
        if (s.config.host === cfg.host && s.config.user === cfg.user && s.config.port === cfg.port) {
          sessionID = s.sessionID;
          break;
        }
      }
      if (!sessionID) {
        sessionID = await App.Connect(cfg);
        setSessions((prev) => {
          const next = new Map(prev);
          next.set(sessionID, { sessionID, config: cfg });
          return next;
        });
      }

      const cols = 80;
      const rows = 24;
      const terminalID = await App.OpenTerminal(sessionID, rows, cols);
      const tab: TerminalTab = {
        terminalID,
        sessionID,
        title: cfg.name || `${cfg.host}`,
      };
      setTabs((prev) => [...prev, tab]);
      setActiveTabID(terminalID);
    } catch (e) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  }, [sessions]);

  const closeTab = useCallback(async (terminalID: string) => {
    let sessionIDToCheck: string | null = null;
    try {
      await App.CloseTerminal(terminalID);
    } catch {
      // 忽略关闭错误
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.terminalID === terminalID);
      const next = prev.filter((t) => t.terminalID !== terminalID);
      const closed = prev[idx];
      if (closed) sessionIDToCheck = closed.sessionID;
      if (activeTabID === terminalID) {
        if (next.length === 0) {
          setActiveTabID(null);
        } else {
          const newIdx = Math.max(0, idx - 1);
          setActiveTabID(next[newIdx].terminalID);
        }
      }
      return next;
    });
    // 该 session 下若已无标签,关闭底层 SSH 连接防止泄漏
    if (sessionIDToCheck) {
      const sid = sessionIDToCheck;
      setTabs((prev) => {
        const stillHas = prev.some((t) => t.sessionID === sid);
        if (!stillHas) {
          App.MaybeCloseSession(sid).then((closed) => {
            if (closed) {
              setSessions((sprev) => {
                const snext = new Map(sprev);
                snext.delete(sid);
                return snext;
              });
            }
          });
        }
        return prev;
      });
    }
  }, [activeTabID]);

  const saveConnection = useCallback(async (cfg: app.ConnectionConfig): Promise<string> => {
    const id = await App.SaveConnection(cfg);
    await refreshConnections();
    return id;
  }, [refreshConnections]);

  const deleteConnection = useCallback(async (id: string) => {
    try {
      await App.DeleteConnection(id);
    } catch (e) {
      setError(String(e));
    }
    // 删除连接时同步关闭其所有终端与 SSH 会话,避免残留可用
    const doomed = new Set<string>();
    for (const [sid, s] of sessions) {
      if (s.config.id === id) {
        doomed.add(sid);
      }
    }
    if (doomed.size > 0) {
      await Promise.all(
        [...doomed].map((sid) => App.CloseSession(sid).catch(() => undefined)),
      );
      const remainingTabs = tabs.filter((t) => !doomed.has(t.sessionID));
      setTabs(remainingTabs);
      setSessions((prev) => {
        const next = new Map(prev);
        for (const sid of doomed) {
          next.delete(sid);
        }
        return next;
      });
      if (activeTabID && !remainingTabs.some((t) => t.terminalID === activeTabID)) {
        setActiveTabID(
          remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].terminalID : null,
        );
      }
    }
    await refreshConnections();
  }, [refreshConnections, sessions, tabs, activeTabID]);

  const clearError = useCallback(() => setError(null), []);

  return {
    tabs,
    activeTabID,
    sessions,
    connections,
    connecting,
    error,
    setActiveTabID,
    refreshConnections,
    openTerminal,
    closeTab,
    saveConnection,
    deleteConnection,
    clearError,
  };
}

export { EventsOn, EventsOff };
