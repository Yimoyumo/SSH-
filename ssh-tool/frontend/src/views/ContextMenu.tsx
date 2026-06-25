import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}
export interface MenuDivider {
  divider: true;
}

export type MenuEntry = MenuItem | MenuDivider;

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  // 边界修正:超出窗口则回退
  const maxX = window.innerWidth - 160;
  const maxY = window.innerHeight - items.length * 32 - 16;
  const px = Math.min(x, Math.max(0, maxX));
  const py = Math.min(y, Math.max(0, maxY));

  return (
    <div className="context-menu" ref={ref} style={{ left: px, top: py }}>
      {items.map((item, i) =>
        "divider" in item ? (
          <div key={i} className="context-menu-divider" />
        ) : (
          <div
            key={i}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon ? <span style={{ width: 14 }}>{item.icon}</span> : null}
            <span>{item.label}</span>
          </div>
        )
      )}
    </div>
  );
}
