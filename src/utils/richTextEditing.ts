export function currentListItem(editor: HTMLElement): HTMLLIElement | null {
  const selection = editor.ownerDocument.getSelection();
  const element = selection?.anchorNode?.nodeType === 1
    ? selection.anchorNode as Element : selection?.anchorNode?.parentElement;
  const item = element?.closest("li");
  return item && editor.contains(item) ? item : null;
}

export function isEmptyEditingBlock(element: Element): boolean {
  return element.textContent === "" && !element.querySelector("img,hr,svg,video,audio,iframe,table,input");
}

export function selectionBlock(editor: HTMLElement): HTMLElement | null {
  const selection = editor.ownerDocument.getSelection();
  const node = selection?.anchorNode;
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  if (!element || !editor.contains(element)) return null;
  const block = element.closest<HTMLElement>("p,div,li");
  return block && (block === editor || editor.contains(block)) ? block : null;
}

export function automaticListContext(editor: HTMLElement, event: Pick<InputEvent, "inputType" | "data" | "isComposing" | "cancelable">): {
  range: Range; block: HTMLElement; kind: "ul" | "ol";
} | null {
  if (!event.cancelable || event.isComposing || event.inputType !== "insertText" || event.data !== " ") return null;
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const excluded = start?.closest('a,code,pre,blockquote,li,ul,ol,[contenteditable="false"]');
  if (excluded && editor.contains(excluded)) return null;
  const block = selectionBlock(editor);
  if (!block || (block === editor && editor.querySelector("p,div,ul,ol,blockquote,pre,table"))) return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(range.startContainer, range.startOffset);
  const marker = prefix.toString();
  if (marker !== "-" && marker !== "1.") return null;
  if (prefix.cloneContents().querySelector("br,img,hr")) return null;
  return { range: range.cloneRange(), block, kind: marker === "-" ? "ul" : "ol" };
}

export function convertAutomaticList(editor: HTMLElement, event: InputEvent): boolean {
  const context = automaticListContext(editor, event);
  if (!context) return false;
  const { range, block, kind } = context;
  const document = editor.ownerDocument;
  const remainder = range.cloneRange();
  remainder.setEnd(block, block.childNodes.length);
  const list = document.createElement(kind);
  const item = document.createElement("li");
  item.append(remainder.cloneContents());
  if (isEmptyEditingBlock(item)) {
    let leaf: HTMLElement = item;
    while (leaf.firstElementChild && /^(STRONG|B|EM|I|U|S|STRIKE|SPAN)$/.test(leaf.firstElementChild.tagName)) {
      leaf = leaf.firstElementChild as HTMLElement;
    }
    if (!item.querySelector("br")) leaf.append(document.createElement("br"));
  }
  if (block.style.cssText) item.style.cssText = block.style.cssText;
  list.append(item);
  const replacement = document.createRange();
  // Selecting the contents keeps Chromium's insertion context in this paragraph.
  // Selecting the paragraph node itself can nest the new list in the following list.
  replacement.selectNodeContents(block);
  const selection = document.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(replacement);
  const inserted = document.execCommand("insertHTML", false, list.outerHTML);
  if (!inserted) {
    selection.removeAllRanges();
    selection.addRange(range);
    return false;
  }
  event.preventDefault();
  const insertedItem = currentListItem(editor);
  if (insertedItem) {
    let start: Node = insertedItem;
    while (start.firstChild && start.firstChild.nodeName !== "BR") start = start.firstChild;
    const caret = document.createRange();
    caret.setStart(start, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  }
  return true;
}

// A native Enter creates an editable landing block. Only that still-empty,
// newly created node is omitted from serialization; authored blank lines remain.
export function serializeRichText(editor: HTMLElement, draft: HTMLElement | null): string {
  if (!draft || draft === editor || !editor.contains(draft) || !isEmptyEditingBlock(draft)) return editor.innerHTML;
  const indexes: number[] = [];
  let node: Node = draft;
  while (node !== editor && node.parentNode) {
    indexes.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
    node = node.parentNode;
  }
  const clone = editor.cloneNode(true) as HTMLElement;
  let copy: Node = clone;
  for (const index of indexes) copy = copy.childNodes[index];
  let parent = copy.parentElement;
  copy.parentNode?.removeChild(copy);
  while (parent && parent !== clone && /^(UL|OL)$/.test(parent.tagName) && !parent.childNodes.length) {
    const next = parent.parentElement;
    parent.remove();
    parent = next;
  }
  return clone.innerHTML;
}

export function validEditorLink(value: string): string | null {
  const text = value.trim();
  if (!text || Array.from(text).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && url.hostname) return text;
    if ((url.protocol === "mailto:" || url.protocol === "tel:") && url.pathname.trim()) return text;
  } catch { /* Invalid addresses are reported in the link dialog. */ }
  return null;
}

export function editorSelectionOffsets(editor: HTMLElement, range: Range): { start: number; end: number } | null {
  if (!editor.contains(range.commonAncestorContainer)) return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  return { start, end: start + range.toString().length };
}

export function editorRangeFromOffsets(editor: HTMLElement, offsets: { start: number; end: number }): Range | null {
  const walker = editor.ownerDocument.createTreeWalker(editor, 4); // Text nodes.
  let position = 0;
  let text = walker.nextNode();
  const range = editor.ownerDocument.createRange();
  let started = false;
  while (text) {
    const length = text.textContent?.length ?? 0;
    if (!started && offsets.start <= position + length) {
      range.setStart(text, offsets.start - position);
      started = true;
    }
    if (started && offsets.end <= position + length) {
      range.setEnd(text, offsets.end - position);
      return range;
    }
    position += length;
    text = walker.nextNode();
  }
  return null;
}

export function pasteLinkOverSelection(editor: HTMLElement, clipboardText: string): boolean {
  // Only a single URL qualifies; ordinary text and rich-text pastes keep the
  // browser's existing paste behavior. No asynchronous clipboard access is used.
  const value = clipboardText.trim();
  if (/\s/u.test(value)) return false;
  const href = validEditorLink(value);
  const selection = editor.ownerDocument.getSelection();
  if (!href || !selection || selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) || !range.toString().trim()) return false;
  const offsets = editorSelectionOffsets(editor, range);
  if (!editor.ownerDocument.execCommand("createLink", false, href)) return false;
  const restored = offsets && editorRangeFromOffsets(editor, offsets);
  if (restored) {
    selection.removeAllRanges();
    selection.addRange(restored);
  }
  return true;
}
