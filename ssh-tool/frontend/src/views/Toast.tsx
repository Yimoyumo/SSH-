import { useEffect, useState, useCallback } from "react";
import "./Toast.css";

export interface ToastItem {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  msg?: string;
  progress?: number; // 0-100,存在则显示进度条
}

let toastIdCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((type: ToastItem["type"], title: string, msg?: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, title, msg }]);
    if (type !== "info" || msg === undefined) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    }
    return id;
  }, []);

  const updateProgress = useCallback((id: number, progress: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, progress } : t)));
  }, []);

  const done = useCallback((id: number, type: ToastItem["type"], title: string, msg?: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, type, title, msg, progress: 100 } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, show, updateProgress, done, dismiss };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => onDismiss(t.id)}>
          <div className="toast-title">{t.title}</div>
          {t.msg ? <div className="toast-msg">{t.msg}</div> : null}
          {t.progress !== undefined ? (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${t.progress}%` }} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

