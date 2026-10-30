import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextLinkDialog } from "./RichTextLinkDialog";
import { pasteMarkdownText } from "../utils/richTextPaste";
import { convertAutomaticList, currentListItem, editorRangeFromOffsets, editorSelectionOffsets, isEmptyEditingBlock, pasteLinkOverSelection, selectionBlock, serializeRichText } from "../utils/richTextEditing";
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
  const lastPublishedRef = useRef<string | null>(null);
  const draftBlockRef = useRef<HTMLElement | null>(null);
  const pendingListEnterRef = useRef(false);
  const [linkEdit, setLinkEdit] = useState<{ range: Range | null; anchor: HTMLAnchorElement | null; href: string } | null>(null);
  const [imageWarning, setImageWarning] = useState<string>();

  useEffect(() => {
    // Our serialized value can omit a native empty landing block. Keep that
    // live block for the caret and undo history until the next real edit.
    if (value === lastPublishedRef.current) return;
    lastPublishedRef.current = null;
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
      draftBlockRef.current = null;
      pendingListEnterRef.current = false;
      savedSelectionRef.current = null;
      setLinkEdit(null);
    }
  }, [value]);

  const publishEditorValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (pendingListEnterRef.current) {
      const block = selectionBlock(editor);
      draftBlockRef.current = block && block !== editor && isEmptyEditingBlock(block) ? block : null;
      pendingListEnterRef.current = false;
    }
    const sanitized = sanitizeMacroImages(serializeRichText(editor, draftBlockRef.current));
    if (sanitized.removedImages > 0) {
      editor.innerHTML = sanitized.html;
      setImageWarning(
        "Uma imagem incompatível, muito grande ou acima do limite foi removida.",
      );
    }
    lastPublishedRef.current = sanitized.html;
    onChange(sanitized.html);
  }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const beforeInput = (event: InputEvent) => {
      if (event.isComposing) return;
      pendingListEnterRef.current = (event.inputType === "insertParagraph" && Boolean(currentListItem(editor))) ||
        (event.inputType === "historyRedo" && Boolean(draftBlockRef.current));
      if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo" &&
          selectionBlock(editor) === draftBlockRef.current) draftBlockRef.current = null;
      if (convertAutomaticList(editor, event)) publishEditorValue();
    };
    editor.addEventListener("beforeinput", beforeInput);
    return () => editor.removeEventListener("beforeinput", beforeInput);
  }, [publishEditorValue]);

  const executeCommand = (command: EditorCommand) => {
    editorRef.current?.focus();
    document.execCommand(command.command, false, command.value);
    publishEditorValue();
  };

  const insertLink = (clickedAnchor?: HTMLAnchorElement) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const current = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const range = current && editor.contains(current.commonAncestorContainer)
      ? current.cloneRange() : savedSelectionRef.current?.cloneRange() ?? null;
    const element = range?.startContainer.nodeType === 1 ? range.startContainer as Element : range?.startContainer.parentElement;
    const candidate = clickedAnchor ?? element?.closest("a") ?? null;
    const anchor = candidate && editor.contains(candidate) ? candidate : null;
    setLinkEdit({ range, anchor, href: anchor?.getAttribute("href") ?? "" });
  };

  const closeLink = (restoreRange = linkEdit?.range) => {
    const editor = editorRef.current;
    if (editor && restoreRange && editor.contains(restoreRange.commonAncestorContainer)) {
      editor.focus();
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(restoreRange);
      savedSelectionRef.current = restoreRange.cloneRange();
    } else editor?.focus();
    setLinkEdit(null);
  };

  const applyLink = (href?: string): boolean => {
    const editor = editorRef.current;
    if (!editor || !linkEdit) return false;
    const offsets = linkEdit.range ? editorSelectionOffsets(editor, linkEdit.range) : null;
    let range = linkEdit.range;
    if (linkEdit.anchor) {
      if (!editor.contains(linkEdit.anchor)) return false;
      range = document.createRange();
      range.selectNodeContents(linkEdit.anchor);
    }
    if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const changed = document.execCommand(href === undefined ? "unlink" : "createLink", false, href);
    if (!changed) return false;
    publishEditorValue();
    closeLink(offsets ? editorRangeFromOffsets(editor, offsets) : linkEdit.range);
    return true;
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
    if (imageFiles.length === 0) {
      const editor = editorRef.current;
      const text = event.clipboardData.getData("text/plain");
      if (!event.defaultPrevented && editor && (pasteLinkOverSelection(editor, text) ||
          pasteMarkdownText(editor, text, event.clipboardData.getData("text/html")))) {
        event.preventDefault();
        publishEditorValue();
        rememberEditorSelection();
      }
      return;
    }
    event.preventDefault();
    rememberEditorSelection();
    void insertImageFiles(imageFiles);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      insertLink();
      return;
    }

    if (event.key !== "Tab" || !editorRef.current) return;

    const listItem = currentListItem(editorRef.current);

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
          onClick={() => insertLink()}
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
        onMouseUp={rememberEditorSelection}
        onKeyUp={rememberEditorSelection}
        onClick={(event) => {
          const anchor = event.target instanceof Element ? event.target.closest("a") : null;
          if (anchor && event.currentTarget.contains(anchor)) {
            event.preventDefault();
            insertLink(anchor);
          }
        }}
        onAuxClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) event.preventDefault();
        }}
        data-placeholder="Digite o texto que será inserido quando o atalho for usado..."
      />
      {linkEdit && <RichTextLinkDialog href={linkEdit.href} existing={Boolean(linkEdit.anchor)}
        canApply={Boolean(linkEdit.anchor || (linkEdit.range && !linkEdit.range.collapsed))}
        onApply={applyLink} onRemove={() => applyLink()} onCancel={closeLink} />}
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
