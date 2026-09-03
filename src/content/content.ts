import { Macro } from "../types/macro";

const STORAGE_KEY = "lilac-keys-macros";

document.addEventListener("keydown", async (e) => {
  if (!(e.key === " " && e.shiftKey)) return;

  const el = document.activeElement;
  const isPlainTextField =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isRichTextField = el instanceof HTMLElement && el.isContentEditable;

  if (!isPlainTextField && !isRichTextField) {
    return;
  }

  const plainTextElement = isPlainTextField ? el : null;
  const richTextElement = isRichTextField ? el : null;

  const start = plainTextElement?.selectionStart ?? 0;
  const valueBeforeCursor = plainTextElement
    ? plainTextElement.value.slice(0, start)
    : getEditableTextBeforeCursor(richTextElement!);
  const { [STORAGE_KEY]: macros = [] } =
    await chrome.storage.local.get(STORAGE_KEY);
  const normalizedValueBeforeCursor = valueBeforeCursor.toLowerCase();
  const macro = (macros as Macro[]).find((item) =>
    normalizedValueBeforeCursor.endsWith(item.atalho.toLowerCase()),
  );

  if (!macro) return;

  e.preventDefault();
  if (plainTextElement) {
    const expandedText = htmlToText(macro.textoExpandido);
    plainTextElement.value =
      plainTextElement.value.slice(0, start - macro.atalho.length) +
      expandedText +
      plainTextElement.value.slice(start);
    plainTextElement.selectionStart = plainTextElement.selectionEnd =
      start - macro.atalho.length + expandedText.length;
    return;
  }

  selectCharactersBeforeCursor(macro.atalho.length);
  document.execCommand("delete", false);
  document.execCommand("insertHTML", false, macro.textoExpandido);
});

function selectCharactersBeforeCursor(length: number): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const editableSelection = selection as Selection & {
    modify?: (
      alter: "move" | "extend",
      direction: "forward" | "backward",
      granularity: "character",
    ) => void;
  };

  editableSelection.collapseToEnd();
  for (let index = 0; index < length; index += 1) {
    editableSelection.modify?.("extend", "backward", "character");
  }
}

function getEditableTextBeforeCursor(element: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return element.innerText;

  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.anchorNode!, selection.anchorOffset);
  return range.toString();
}

function htmlToText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.innerText;
}
