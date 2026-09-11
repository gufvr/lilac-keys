import { Macro } from "../types/macro";

const PLACEHOLDER_PATTERN = /%[^%\r\n]+%/g;
let isExpandingMacro = false;

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && moveToNextPlaceholder(e)) return;
  if (e.key !== " " || !e.shiftKey || !isSupportedEditable(document.activeElement)) {
    return;
  }
  if (isExpandingMacro) return;

  e.preventDefault();
  e.stopPropagation();
  void handleKeydown(e).catch((error: unknown) => {
    if (isExtensionContextInvalidated(error)) return;
    console.error("LilacKeys: erro ao processar atalho", error);
  });
}, true);

async function handleKeydown(e: KeyboardEvent): Promise<void> {
  if (!(e.key === " " && e.shiftKey)) return;

  if (isExpandingMacro) return;
  isExpandingMacro = true;
  try {
    const el = document.activeElement;
    const isPlainTextField =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    const isRichTextField = el instanceof HTMLElement && el.isContentEditable;

    if (!isPlainTextField && !isRichTextField) return;

    const plainTextElement = isPlainTextField ? el : null;
    const richTextElement = isRichTextField ? el : null;
    const macros = await loadMacros();
    if (!macros) {
      insertSpace(
        plainTextElement,
        richTextElement,
        plainTextElement?.selectionStart ?? 0,
      );
      return;
    }
    const maxShortcutLength = getMaxShortcutLength(macros);
    const start = plainTextElement?.selectionStart ?? 0;
    const valueBeforeCursor = plainTextElement
      ? plainTextElement.value.slice(
          Math.max(0, start - maxShortcutLength),
          start,
        )
      : getEditableTextBeforeCursor(richTextElement!, maxShortcutLength);
    expandMacro(
      macros,
      plainTextElement,
      richTextElement,
      start,
      valueBeforeCursor,
    );
  } catch (error) {
    console.error("LilacKeys: falha ao carregar macros", error);
  } finally {
    isExpandingMacro = false;
  }
}

function isSupportedEditable(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
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
  let macro: Macro | undefined;
  let shortcutLength = 0;
  for (const item of macros) {
    const shortcut = item.atalho.trim().toLowerCase();
    if (
      shortcut.length > shortcutLength &&
      normalizedValueBeforeCursor.endsWith(shortcut)
    ) {
      macro = item;
      shortcutLength = shortcut.length;
    }
  }

  if (!macro) {
    insertSpace(plainTextElement, richTextElement, start);
    return;
  }

  if (plainTextElement) {
    const expandedText = htmlToText(macro.textoExpandido);
    const replacementStart = start - shortcutLength;
    plainTextElement.setRangeText(
      expandedText,
      replacementStart,
      start,
      "end",
    );
    dispatchInputEvent(plainTextElement);
    selectNextInputPlaceholder(plainTextElement, replacementStart);
    return;
  }

  if (!selectCharactersBeforeCursor(shortcutLength)) return;
  const expandedHtml = hasPlaceholders(macro.textoExpandido)
    ? addPlaceholderMarkers(macro.textoExpandido)
    : macro.textoExpandido;
  document.execCommand(
    "insertHTML",
    false,
    expandedHtml,
  );
  selectNextContentPlaceholder(richTextElement!);
}

function getMaxShortcutLength(macros: Macro[]): number {
  return macros.reduce(
    (maxLength, macro) => Math.max(maxLength, macro.atalho.trim().length),
    0,
  );
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
  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
      }),
    );
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function hasPlaceholders(html: string): boolean {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  const result = PLACEHOLDER_PATTERN.test(html);
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return result;
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
    plainTextElement.setRangeText(" ", start, start, "end");
    dispatchInputEvent(plainTextElement);
    return;
  }

  if (richTextElement) {
    document.execCommand("insertText", false, " ");
  }
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return String(error).includes("Extension context invalidated");
}

function selectCharactersBeforeCursor(length: number): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

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
  return true;
}

function getEditableTextBeforeCursor(
  element: HTMLElement,
  maxLength: number,
): string {
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !anchorNode ||
    !element.contains(anchorNode) ||
    maxLength <= 0
  ) {
    return "";
  }

  // Walk backward through nearby text nodes so large editors are never serialized wholesale.
  let textNode: Text | null;
  let offset: number;
  if (anchorNode.nodeType === Node.TEXT_NODE) {
    textNode = anchorNode as Text;
    offset = Math.min(selection.anchorOffset, textNode.data.length);
  } else {
    const child = anchorNode.childNodes[selection.anchorOffset - 1];
    textNode = child
      ? findLastTextNode(child)
      : findPreviousTextNode(element, anchorNode);
    offset = textNode?.data.length ?? 0;
  }

  const parts: string[] = [];
  let remaining = maxLength;
  while (textNode && remaining > 0) {
    const text = textNode.data.slice(0, offset);
    const part = text.slice(-remaining);
    if (part) parts.unshift(part);
    remaining -= part.length;
    textNode = findPreviousTextNode(element, textNode);
    offset = textNode?.data.length ?? 0;
  }
  return parts.join("");
}

function findLastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const textNode = findLastTextNode(node.childNodes[index]);
    if (textNode) return textNode;
  }
  return null;
}

function findPreviousTextNode(root: Node, node: Node): Text | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.previousSibling) {
      const textNode = findLastTextNode(current.previousSibling);
      if (textNode) return textNode;
    }
    current = current.parentNode;
  }
  return null;
}

function htmlToText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.innerText;
}
