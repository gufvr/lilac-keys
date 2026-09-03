import { useEffect, useRef } from "react";
import "./RichTextEditor.css";

interface RichTextEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

type EditorCommand = {
  command: string;
  icon: string;
  label: string;
  value?: string;
};

const commands: EditorCommand[] = [
  { command: "bold", icon: "format_bold", label: "Negrito" },
  { command: "italic", icon: "format_italic", label: "Itálico" },
  { command: "underline", icon: "format_underlined", label: "Sublinhado" },
  { command: "strikeThrough", icon: "strikethrough_s", label: "Tachado" },
  {
    command: "formatBlock",
    icon: "format_quote",
    label: "Quote",
    value: "blockquote",
  },
  {
    command: "insertOrderedList",
    icon: "format_list_numbered",
    label: "Lista numerada",
  },
  {
    command: "insertUnorderedList",
    icon: "format_list_bulleted",
    label: "Bullet points",
  },
  {
    command: "justifyLeft",
    icon: "format_align_left",
    label: "Alinhar à esquerda",
  },
  {
    command: "justifyCenter",
    icon: "format_align_center",
    label: "Centralizar",
  },
  {
    command: "justifyRight",
    icon: "format_align_right",
    label: "Alinhar à direita",
  },
  { command: "justifyFull", icon: "format_align_justify", label: "Justificar" },
];

export function RichTextEditor({ id, value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const executeCommand = (command: EditorCommand) => {
    editorRef.current?.focus();
    document.execCommand(command.command, false, command.value);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  const insertLink = () => {
    const url = window.prompt("Digite a URL do link");
    if (!url) return;

    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <div className="rich-text-editor">
      <div
        className="rich-text-toolbar"
        role="toolbar"
        aria-label="Formatação do texto"
      >
        {commands.map((command) => (
          <button
            key={command.command + (command.value ?? "")}
            type="button"
            className="rich-text-tool"
            aria-label={command.label}
            title={command.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => executeCommand(command)}
          >
            <span className="material-symbols-outlined">{command.icon}</span>
          </button>
        ))}
        <button
          type="button"
          className="rich-text-tool"
          aria-label="Inserir link"
          title="Inserir link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertLink}
        >
          <span className="material-symbols-outlined">link</span>
        </button>
      </div>
      <div
        id={id}
        ref={editorRef}
        className="rich-text-content"
        contentEditable
        role="textbox"
        aria-multiline="true"
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        data-placeholder="Digite o texto que será inserido quando o atalho for usado..."
      />
    </div>
  );
}
