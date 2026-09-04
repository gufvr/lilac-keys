import { Macro } from "../types/macro";

const PLACEHOLDER_PATTERN = /%[^%\r\n]+%/g;

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && moveToNextPlaceholder(e)) return;
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
    const replacementStart = start - macro.atalho.length;
    plainTextElement.value =
      plainTextElement.value.slice(0, start - macro.atalho.length) +
      expandedText +
      plainTextElement.value.slice(start);
    const cursor = replacementStart + expandedText.length;
    plainTextElement.selectionStart = plainTextElement.selectionEnd = cursor;
    dispatchInputEvent(plainTextElement);
    selectNextInputPlaceholder(plainTextElement, replacementStart);
    return;
  }

  selectCharactersBeforeCursor(macro.atalho.length);
  document.execCommand("delete", false);
  document.execCommand(
    "insertHTML",
    false,
    addPlaceholderMarkers(macro.textoExpandido),
  );
  selectNextContentPlaceholder(richTextElement!);
}

function moveToNextPlaceholder(event: KeyboardEvent): boolean {
  const element = document.activeElement;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const start = element.selectionEnd ?? 0;
    const next = findPlaceholder(element.value, start);
    if (!next) return false;
    event.preventDefault();
    element.setSelectionRange(next.start, next.end);
    return true;
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    const placeholders = Array.from(
      element.querySelectorAll<HTMLElement>("[data-lilackeys-placeholder]"),
    );
    const selection = window.getSelection();
    const currentIndex = placeholders.findIndex(
      (placeholder) =>
        selection?.anchorNode && placeholder.contains(selection.anchorNode),
    );
    const next = placeholders[currentIndex + 1];
    if (!next) return false;
    event.preventDefault();
    selectElementContents(next);
    return true;
  }

  return false;
}

function selectNextInputPlaceholder(
  element: HTMLInputElement | HTMLTextAreaElement,
  from: number,
): void {
  const next = findPlaceholder(element.value, from);
  if (next) element.setSelectionRange(next.start, next.end);
}

function findPlaceholder(
  value: string,
  from: number,
): { start: number; end: number } | null {
  PLACEHOLDER_PATTERN.lastIndex = from;
  const match = PLACEHOLDER_PATTERN.exec(value);
  if (!match || match.index < from) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function dispatchInputEvent(
  element: HTMLInputElement | HTMLTextAreaElement,
): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function addPlaceholderMarkers(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue ?? "";
    if (!PLACEHOLDER_PATTERN.test(text)) return;
    PLACEHOLDER_PATTERN.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match = PLACEHOLDER_PATTERN.exec(text);
    while (match) {
      fragment.append(text.slice(cursor, match.index));
      const marker = document.createElement("span");
      marker.dataset.lilackeysPlaceholder = "true";
      marker.textContent = match[0];
      fragment.append(marker);
      cursor = match.index + match[0].length;
      match = PLACEHOLDER_PATTERN.exec(text);
    }
    fragment.append(text.slice(cursor));
    textNode.replaceWith(fragment);
  });

  return container.innerHTML;
}

function selectNextContentPlaceholder(element: HTMLElement): void {
  const placeholder = element.querySelector<HTMLElement>(
    "[data-lilackeys-placeholder]",
  );
  if (placeholder) selectElementContents(placeholder);
}

function selectElementContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
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
