import { useEffect, useRef, useState } from "react";
import {
  isSupportedImageFile,
  MAX_EMBEDDED_IMAGE_BYTES,
  MAX_MACRO_IMAGES,
  sanitizeMacroImages,
} from "../utils/macroImages";
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const [imageWarning, setImageWarning] = useState<string>();

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const publishEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitized = sanitizeMacroImages(editor.innerHTML);
    if (sanitized.removedImages > 0) {
      editor.innerHTML = sanitized.html;
      setImageWarning(
        "Uma imagem incompatível, muito grande ou acima do limite foi removida.",
      );
    }
    onChange(sanitized.html);
  };

  const executeCommand = (command: EditorCommand) => {
    editorRef.current?.focus();
    document.execCommand(command.command, false, command.value);
    publishEditorValue();
  };

  const insertLink = () => {
    const url = window.prompt("Digite a URL do link");
    if (!url) return;

    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    publishEditorValue();
  };

  const rememberEditorSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange();
    }
  };

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    const range = savedSelectionRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    const fallback = document.createRange();
    fallback.selectNodeContents(editor);
    fallback.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallback);
    return true;
  };

  const insertImageFiles = async (files: readonly File[]) => {
    const editor = editorRef.current;
    if (!editor || files.length === 0) return;
    const availableSlots =
      MAX_MACRO_IMAGES - editor.querySelectorAll("img").length;
    if (availableSlots <= 0) {
      setImageWarning(`Use no máximo ${MAX_MACRO_IMAGES} imagens por macro.`);
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const acceptedFiles = selectedFiles.filter(isSupportedImageFile);
    if (acceptedFiles.length !== selectedFiles.length) {
      setImageWarning(
        `Use PNG, JPEG, GIF ou WebP com até ${MAX_EMBEDDED_IMAGE_BYTES / 1024} KB por imagem.`,
      );
    }

    try {
      for (const file of acceptedFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        restoreEditorSelection();
        const previousCount = editor.querySelectorAll("img").length;
        document.execCommand("insertImage", false, dataUrl);
        const images = editor.querySelectorAll<HTMLImageElement>("img");
        if (images.length === previousCount) continue;
        const insertedImage = images[images.length - 1];
        if (!insertedImage.alt) insertedImage.alt = file.name || "Imagem";
        rememberEditorSelection();
      }
    } catch {
      setImageWarning("Não foi possível ler uma das imagens selecionadas.");
    }

    if (files.length > availableSlots) {
      setImageWarning(`Use no máximo ${MAX_MACRO_IMAGES} imagens por macro.`);
    } else if (acceptedFiles.length === selectedFiles.length) {
      setImageWarning(undefined);
    }
    publishEditorValue();
  };

  const openImagePicker = () => {
    rememberEditorSelection();
    imageInputRef.current?.click();
  };

  const handleImageInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void insertImageFiles(files);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === 0) return;
    event.preventDefault();
    rememberEditorSelection();
    void insertImageFiles(imageFiles);
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
    publishEditorValue();
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
        <button
          type="button"
          className="rich-text-tool"
          aria-label="Inserir imagem do computador"
          title="Inserir imagem do computador"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openImagePicker}
        >
          <span className="material-symbols-outlined">image</span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={handleImageInput}
        />
      </div>
      {imageWarning && (
        <div className="rich-text-image-warning" role="status">
          {imageWarning}
        </div>
      )}
      <div
        id={id}
        ref={editorRef}
        className="rich-text-content"
        contentEditable
        role="textbox"
        aria-multiline="true"
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={publishEditorValue}
        data-placeholder="Digite o texto que será inserido quando o atalho for usado..."
      />
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler a imagem"));
    reader.readAsDataURL(file);
  });
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
