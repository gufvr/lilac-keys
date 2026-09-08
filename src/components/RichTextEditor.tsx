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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key.toLowerCase() === "k" && event.ctrlKey) {
      event.preventDefault();
      insertLink();
      return;
    }

    if (event.key !== "Tab" || !editorRef.current) return;

    const selection = window.getSelection();
    const listItem = getListItem(selection?.anchorNode, editorRef.current);

    if (!listItem) return;

    event.preventDefault();
    if (event.shiftKey) {
      outdentListItem(listItem);
    } else {
      indentListItem(listItem);
    }
    onChange(editorRef.current.innerHTML);
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
        onKeyDown={handleKeyDown}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        data-placeholder="Digite o texto que será inserido quando o atalho for usado..."
      />
    </div>
  );
}

function getListItem(
  node: Node | null | undefined,
  editor: HTMLElement,
): HTMLLIElement | null {
  let current: Node | null = node ?? null;
  while (current && current !== editor) {
    if (current instanceof HTMLLIElement) return current;
    current = current.parentNode;
  }
  return null;
}

function indentListItem(listItem: HTMLLIElement): void {
  const previousItem = listItem.previousElementSibling;
  if (!(previousItem instanceof HTMLLIElement)) return;

  const parentList = listItem.parentElement;
  if (!(parentList instanceof HTMLUListElement || parentList instanceof HTMLOListElement)) {
    return;
  }

  let nestedList = Array.from(previousItem.children).find(
    (child) =>
      child instanceof HTMLUListElement || child instanceof HTMLOListElement,
  ) as HTMLUListElement | HTMLOListElement | undefined;

  if (!nestedList) {
    nestedList =
      parentList instanceof HTMLUListElement
        ? document.createElement("ul")
        : document.createElement("ol");
    previousItem.append(nestedList);
  }

  nestedList.append(listItem);
}

function outdentListItem(listItem: HTMLLIElement): void {
  const parentList = listItem.parentElement;
  const parentItem = parentList?.parentElement;
  if (
    !(parentList instanceof HTMLUListElement || parentList instanceof HTMLOListElement) ||
    !(parentItem instanceof HTMLLIElement)
  ) {
    return;
  }

  const grandparentList = parentItem.parentElement;
  if (
    !(grandparentList instanceof HTMLUListElement) &&
    !(grandparentList instanceof HTMLOListElement)
  ) {
    return;
  }

  grandparentList.insertBefore(listItem, parentItem.nextSibling);
  if (parentList.children.length === 0) parentList.remove();
}
