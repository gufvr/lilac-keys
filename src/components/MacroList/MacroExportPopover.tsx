import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./MacroExportPopover.css";

interface MacroExportPopoverProps {
  format: "json" | "txt";
  count: number;
  trigger: HTMLButtonElement;
  onExport: (includeFolders: boolean) => void;
  onClose: () => void;
}

export function MacroExportPopover({
  format, count, trigger, onExport, onClose,
}: MacroExportPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const doc = trigger.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    const reposition = () => {
      if (!trigger.isConnected) {
        closeRef.current();
        return;
      }
      const anchor = trigger.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      const margin = 8;
      const top = anchor.bottom + margin + bounds.height <= view.innerHeight
        ? anchor.bottom + margin
        : Math.max(margin, anchor.top - bounds.height - margin);
      const left = Math.max(margin, Math.min(anchor.right - bounds.width, view.innerWidth - bounds.width - margin));
      setPosition({ top, left });
    };
    reposition();
    panel.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !panel.contains(target)) closeRef.current();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    trigger.setAttribute("aria-expanded", "true");
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("click", outside, true);
    doc.addEventListener("keydown", escape, true);
    view.addEventListener("resize", reposition);
    doc.addEventListener("scroll", reposition, true);
    return () => {
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("click", outside, true);
      doc.removeEventListener("keydown", escape, true);
      view.removeEventListener("resize", reposition);
      doc.removeEventListener("scroll", reposition, true);
      trigger.setAttribute("aria-expanded", "false");
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [trigger]);

  return createPortal(
    <div
      ref={panelRef}
      className="macro-export-popover"
      role="dialog"
      aria-labelledby={titleId}
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Tab") return;
        const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
        const current = buttons.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement);
        if ((event.shiftKey && current === 0) || (!event.shiftKey && current === buttons.length - 1)) {
          event.preventDefault();
          buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
        }
      }}
    >
      <div className="macro-export-header">
        <h3 id={titleId}>Exportar {format.toUpperCase()}</h3>
        <span className="macro-export-count">{count} {count === 1 ? "snippet" : "snippets"}</span>
      </div>
      <button type="button" className="macro-export-option"
        aria-label={`Exportar snippet em ${format.toUpperCase()} sem pastas`}
        title="Sem pastas; importa na raiz" onClick={() => onExport(false)}>
        <span className="macro-export-option-icon material-symbols-outlined" aria-hidden="true">description</span>
        <span className="macro-export-option-content">
          <strong>Exportar snippet</strong>
          <span>Sem pastas; importa na raiz</span>
        </span>
        <span className="macro-export-arrow material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </button>
      <button type="button" className="macro-export-option"
        aria-label={`Exportar snippet e pasta(s) em ${format.toUpperCase()}`}
        title="Mantém o caminho da pasta" onClick={() => onExport(true)}>
        <span className="macro-export-option-icon material-symbols-outlined" aria-hidden="true">folder</span>
        <span className="macro-export-option-content">
          <strong>Exportar snippet e pasta(s)</strong>
          <span>Mantém o caminho da pasta</span>
        </span>
        <span className="macro-export-arrow material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </button>
      <div className="macro-export-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>,
    trigger.ownerDocument.body,
  );
}
