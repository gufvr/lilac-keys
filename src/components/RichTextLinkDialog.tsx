import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { validEditorLink } from "../utils/richTextEditing";

interface RichTextLinkDialogProps {
  href: string;
  existing: boolean;
  canApply: boolean;
  onApply: (href: string) => boolean;
  onRemove: () => boolean;
  onCancel: () => void;
}

export function RichTextLinkDialog({ href, existing, canApply, onApply, onRemove, onCancel }: RichTextLinkDialogProps) {
  const [url, setUrl] = useState(href);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const apply = () => {
    const value = validEditorLink(url);
    if (!value) {
      setError("Informe uma URL HTTPS, mailto ou tel válida.");
      inputRef.current?.focus();
      return;
    }
    if (!onApply(value)) setError("O texto selecionado mudou. Feche a caixa e selecione o texto novamente.");
  };
  return createPortal(
    <div className="rich-text-link-backdrop" onMouseDown={(event) => {
      event.stopPropagation();
      if (event.target === event.currentTarget) onCancel();
    }} onClick={(event) => event.stopPropagation()}>
      <div ref={dialogRef} className="rich-text-link-dialog" role="dialog" aria-modal="true"
        aria-labelledby={`${id}-title`} onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          if (event.key === "Enter" && (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey)) {
            event.preventDefault(); if (canApply) apply();
          }
          if (event.key === "Tab") {
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button:not(:disabled)") ?? []);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <h3 id={`${id}-title`}>{existing ? "Editar link" : "Inserir link"}</h3>
        <label htmlFor={`${id}-url`}>URL do link</label>
        <input ref={inputRef} id={`${id}-url`} className="input" type="text" value={url}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : !canApply ? `${id}-hint` : undefined}
          onChange={(event) => { setUrl(event.target.value); setError(""); }} autoComplete="off" />
        {!canApply && <p id={`${id}-hint`}>Selecione um texto no editor para inserir um link.</p>}
        {error && <p id={`${id}-error`} role="alert">{error}</p>}
        <div className="rich-text-link-actions">
          {existing && <button type="button" className="btn btn-secondary" onClick={() => {
            if (!onRemove()) setError("O link mudou. Feche a caixa e selecione o link novamente.");
          }}>Remover link</button>}
          <button type="button" className="btn btn-secondary" onClick={() => onCancel()}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!canApply} onClick={apply}>Salvar link</button>
        </div>
      </div>
    </div>, document.body,
  );
}
