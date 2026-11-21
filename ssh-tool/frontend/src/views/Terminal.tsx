import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { resolveTerminalFont } from "../fonts";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import * as App from "../../wailsjs/go/app/App";
import { EventsOn, EventsOff, ClipboardSetText, ClipboardGetText } from "../../wailsjs/runtime/runtime";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";

interface TerminalViewProps {
  terminalID: string;
  visible: boolean;
  fontSize: number;
  fontFamily: string;
}

export default function TerminalView({ terminalID, visible, fontSize, fontFamily }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: `"${resolveTerminalFont(fontFamily)}", "Noto Sans Mono CJK SC", "DejaVu Sans Mono", monospace`,
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: {
        background: "#171b28",
        foreground: "#ccd2e0",
        cursor: "#7d8ff0",
        selectionBackground: "rgba(125, 143, 240, 0.3)",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
      });
      term.loadAddon(webgl);
    } catch {
      // WebGL 不可用时回退 DOM 渲染器;此处吞异常属预期降级路径
    }
    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      // 容器未布局完成,忽略
    }

    const onDataHandler = (data: string) => {
      App.WriteTerminal(terminalID, data);
    };
    term.onData(onDataHandler);

    // 复制粘贴:Ctrl+Shift+C 复制选中,Ctrl+Shift+V 粘贴
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
        const sel = term.getSelection();
        if (sel) {
          ClipboardSetText(sel);
        }
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.code === "KeyV") {
        ClipboardGetText().then((text) => {
          if (text) {
            App.WriteTerminal(terminalID, text);
          }
        });
        return false;
      }
      return true;
    });

    // 右键:有选中→复制,无选中→粘贴
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const sel = term.getSelection();
      if (sel) {
        ClipboardSetText(sel);
        term.clearSelection();
      } else {
        ClipboardGetText().then((text) => {
          if (text) {
            App.WriteTerminal(terminalID, text);
          }
        });
      }
    };
    containerRef.current.addEventListener("contextmenu", onContextMenu);

    const dataEvent = `term:data:${terminalID}`;
    const exitEvent = `term:exit:${terminalID}`;
    const onData = (data: string) => {
      term.write(data);
    };
    const onExit = () => {
      term.write("\r\n[连接已关闭]\r\n");
    };
    EventsOn(dataEvent, onData);
    EventsOn(exitEvent, onExit);

    const resize = () => {
      try {
        fit.fit();
        App.ResizeTerminal(terminalID, term.rows, term.cols);
      } catch {
        // 忽略
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    return () => {
      EventsOff(dataEvent);
      EventsOff(exitEvent);
      ro.disconnect();
      if (containerRef.current) {
        containerRef.current.removeEventListener("contextmenu", onContextMenu);
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalID]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = `"${resolveTerminalFont(fontFamily)}", "Noto Sans Mono CJK SC", "DejaVu Sans Mono", monospace`;
    try {
      fitRef.current?.fit();
    } catch {
      // 容器未布局完成,忽略
    }
  }, [fontSize, fontFamily]);

  useEffect(() => {
    if (visible && termRef.current && fitRef.current) {
      setTimeout(() => {
        try {
          fitRef.current?.fit();
          const term = termRef.current;
          if (term) {
            App.ResizeTerminal(terminalID, term.rows, term.cols);
          }
        } catch {
          // 忽略
        }
      }, 50);
    }
  }, [visible, terminalID]);

  return <div className="terminal-wrap" ref={containerRef} />;
}
