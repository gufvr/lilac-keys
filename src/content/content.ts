import { Macro } from "../types/macro";

document.addEventListener("keydown", (e) => {
  void handleKeydown(e).catch((error: unknown) => {
    if (isExtensionContextInvalidated(error)) return;
    console.error("LilacKeys: erro ao processar atalho", error);
  });
});

async function handleKeydown(e: KeyboardEvent): Promise<void> {
  if (!(e.key === " " && e.shiftKey)) return;

  const el = document.activeElement;
  const isPlainTextField =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isRichTextField = el instanceof HTMLElement && el.isContentEditable;

  if (!isPlainTextField && !isRichTextField) {
    return;
  }

  e.preventDefault();

  const plainTextElement = isPlainTextField ? el : null;
  const richTextElement = isRichTextField ? el : null;

  const start = plainTextElement?.selectionStart ?? 0;
  const valueBeforeCursor = plainTextElement
    ? plainTextElement.value.slice(0, start)
    : getEditableTextBeforeCursor(richTextElement!);
  try {
    const macros = await loadMacros();
    if (!macros) {
      insertSpace(plainTextElement, richTextElement, start);
      return;
    }
    expandMacro(
      macros,
      plainTextElement,
      richTextElement,
      start,
      valueBeforeCursor,
    );
  } catch (error) {
    console.error("LilacKeys: falha ao carregar macros", error);
  }
}

function loadMacros(): Promise<Macro[] | null> {
  return new Promise((resolve) => {
    if (chrome.storage?.local) {
      try {
        chrome.storage.local.get("lilac-keys-macros", (result) => {
          const error = chrome.runtime.lastError;
          if (!error) {
            resolve((result["lilac-keys-macros"] as Macro[] | undefined) ?? []);
            return;
          }
          requestMacrosFromBackground(resolve);
        });
        return;
      } catch {
        requestMacrosFromBackground(resolve);
        return;
      }
    }

    requestMacrosFromBackground(resolve);
  });
}

function requestMacrosFromBackground(
  resolve: (macros: Macro[] | null) => void,
): void {
  try {
    chrome.runtime.sendMessage({ type: "getMacros" }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        if (!isExtensionContextInvalidated(error)) {
          console.error("LilacKeys: falha ao carregar macros", error);
        }
        resolve(null);
        return;
      }
      resolve((response?.macros as Macro[] | undefined) ?? []);
    });
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      console.error("LilacKeys: falha ao carregar macros", error);
    }
    resolve(null);
  }
}

function expandMacro(
  macros: Macro[],
  plainTextElement: HTMLInputElement | HTMLTextAreaElement | null,
  richTextElement: HTMLElement | null,
  start: number,
  valueBeforeCursor: string,
): void {
  const normalizedValueBeforeCursor = valueBeforeCursor.toLowerCase();
  const macro = macros.find((item) =>
    normalizedValueBeforeCursor.endsWith(item.atalho.toLowerCase()),
  );

  if (!macro) {
    insertSpace(plainTextElement, richTextElement, start);
    return;
  }

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
}

function insertSpace(
  plainTextElement: HTMLInputElement | HTMLTextAreaElement | null,
  richTextElement: HTMLElement | null,
  start: number,
): void {
  if (plainTextElement) {
    plainTextElement.value =
      plainTextElement.value.slice(0, start) +
      " " +
      plainTextElement.value.slice(start);
    plainTextElement.selectionStart = plainTextElement.selectionEnd = start + 1;
    return;
  }

  if (richTextElement) {
    document.execCommand("insertText", false, " ");
  }
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return String(error).includes("Extension context invalidated");
}

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
