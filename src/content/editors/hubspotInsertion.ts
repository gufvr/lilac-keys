// This module uses DOM events, which cross Chrome's isolated-world boundary.
// It never reaches into React/Remirror internals or mounts a second editor.
export interface HubSpotInsertionResult {
  inserted: boolean;
  batchDurationsMs: number[];
  failureReason?: string;
  insertedRange?: Range;
}

export interface InsertionOptions {
  yieldFrame?: () => Promise<void>;
  createPasteEvent?: (html: string, text: string) => ClipboardEvent;
}

const MAX_SCAN_NODES = 4096;
const MAX_SCAN_CHARACTERS = 256 * 1024;
const BLOCKS = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|LI)$/;

export function currentEditorRange(editor: HTMLElement): Range | null {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (!editor.isConnected || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return null;
  }
  let active = editor.ownerDocument.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active !== editor && !editor.contains(active)) return null;
  return range;
}

export function sameRange(first: Range, second: Range | null): boolean {
  return Boolean(second && first.startContainer === second.startContainer &&
    first.startOffset === second.startOffset && first.endContainer === second.endContainer &&
    first.endOffset === second.endOffset);
}

function previousNode(root: Node, node: Node): Node | null {
  if (node === root) return null;
  if (node.previousSibling) {
    let previous = node.previousSibling;
    while (previous.lastChild) previous = previous.lastChild;
    return previous;
  }
  return node.parentNode === root ? null : node.parentNode;
}

// Read only the suffix near the caret, never range.toString() over the full editor.
export function textBeforeHubSpotCaret(editor: HTMLElement, length: number): string {
  const range = currentEditorRange(editor);
  if (!range?.collapsed || length <= 0) return "";
  const match = backwardRange(editor, range, length);
  return match?.toString() ?? "";
}

export function shortcutRange(editor: HTMLElement, length: number): Range | null {
  const caret = currentEditorRange(editor);
  return caret?.collapsed ? backwardRange(editor, caret, length) : null;
}

function backwardRange(editor: HTMLElement, end: Range, length: number): Range | null {
  let node: Node | null = end.endContainer;
  let offset = end.endOffset;
  let remaining = Math.min(length, MAX_SCAN_CHARACTERS);
  const range = end.cloneRange();
  for (let visited = 0; node && visited < MAX_SCAN_NODES; visited += 1) {
    if (node.nodeType === 3) {
      const consumed = Math.min(offset, remaining);
      remaining -= consumed;
      range.setStart(node, offset - consumed);
      if (remaining === 0) return range;
    } else if (offset > 0) {
      node = node.childNodes[offset - 1];
      offset = node.nodeType === 3 ? (node.textContent ?? "").length : node.childNodes.length;
      continue;
    }
    if (node.nodeType === 1 && BLOCKS.test((node as Element).tagName)) break;
    node = previousNode(editor, node);
    offset = node?.nodeType === 3 ? (node.textContent ?? "").length : 0;
  }
  return remaining === length ? null : range;
}

function plainText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (element.tagName === "BR") return "\n";
  const content = Array.from(node.childNodes).map(plainText).join("");
  return content + (BLOCKS.test(element.tagName) ? "\n" : "");
}

function selectRange(editor: HTMLElement, range: Range): void {
  const selection = editor.ownerDocument.defaultView!.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  // ProseMirror maintains a model selection separately from the DOM selection.
  editor.ownerDocument.dispatchEvent(new editor.ownerDocument.defaultView!.Event("selectionchange"));
}

function releaseProseMirrorShiftState(editor: HTMLElement, view: Window): void {
  // `KeyboardEventInit.keyCode` is ignored by some Chromium versions because
  // it is legacy/read-only. ProseMirror's keyup handler intentionally checks
  // that legacy value, so expose it explicitly to the handler.
  const KeyboardEventClass = (view as Window & typeof globalThis).KeyboardEvent;
  const event = new KeyboardEventClass("keyup", {
    key: "Shift", code: "ShiftLeft", bubbles: true,
  });
  for (const property of ["keyCode", "which"] as const) {
    try {
      Object.defineProperty(event, property, { configurable: true, value: 16 });
    } catch {
      // A browser that does not allow overriding it already receives the
      // standards-based key/code values above.
    }
  }
  editor.dispatchEvent(event);
}

export async function insertHubSpotModelHtml(
  editor: HTMLElement,
  html: string,
  options: InsertionOptions = {},
): Promise<HubSpotInsertionResult> {
  const ownerDocument = editor.ownerDocument;
  const view = ownerDocument.defaultView!;
  const initialRange = currentEditorRange(editor)?.cloneRange();
  if (!initialRange) return { inserted: false, batchDurationsMs: [], failureReason: "selection-left-editor" };
  const root = ownerDocument.createElement("div");
  root.innerHTML = html; // Detached payload only; never the live editor.
  const yieldFrame = options.yieldFrame ?? (() => new Promise<void>(resolve => view.requestAnimationFrame(() => resolve())));
  let changed = false;
  const observer = new view.MutationObserver(records => {
    if (records.some(record => record.type === "childList" || record.type === "characterData")) changed = true;
  });
  observer.observe(editor, { subtree: true, childList: true, characterData: true });
  const hasChanges = () => {
    if (observer.takeRecords().length) changed = true;
    return changed;
  };
  const durations: number[] = [];
  const fail = (reason: string): HubSpotInsertionResult => ({ inserted: false, batchDurationsMs: durations, failureReason: reason });
  try {
    const started = performance.now();
    let event: ClipboardEvent | null = null;
    try {
      if (options.createPasteEvent) event = options.createPasteEvent(html, plainText(root));
      else {
        const data = new view.DataTransfer();
        data.setData("text/html", html);
        data.setData("text/plain", plainText(root));
        event = new view.ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true, composed: true });
      }
    } catch {
      // API unavailable: only the unchanged-selection fallback below may run.
    }
    selectRange(editor, initialRange);
    if (event) {
      // Shift+Space leaves PM's Shift state set. Otherwise its paste handler
      // intentionally chooses plain text. Reset it before emitting the paste.
      releaseProseMirrorShiftState(editor, view);
      if (!sameRange(initialRange, currentEditorRange(editor))) return fail("selection-changed");
      editor.dispatchEvent(event);
    }
    durations.push(performance.now() - started);
    await yieldFrame();
    await yieldFrame();
    if (!currentEditorRange(editor)) return fail("selection-left-editor");

    if (!hasChanges()) {
      // Cancellation without a mutation may be an asynchronous handler. Do not
      // retry it, because it could insert later and duplicate the macro.
      if (event?.defaultPrevented) return fail("paste-cancelled-without-insertion");
      if (!sameRange(initialRange, currentEditorRange(editor))) return fail("selection-changed");
      const fallbackStarted = performance.now();
      // One semantic fragment preserves boundaries; no list-splitting batches,
      // marker nodes, innerHTML replacement or rollback on the managed editor.
      try { ownerDocument.execCommand("insertHTML", false, html); }
      catch { return fail("semantic-fallback-unavailable"); }
      durations.push(performance.now() - fallbackStarted);
      await yieldFrame();
      await yieldFrame();
      if (!hasChanges()) return fail("semantic-fallback-no-insertion");
    }
    const caret = currentEditorRange(editor);
    if (!caret?.collapsed) return fail("selection-changed");
    const insertedRange = locateInsertedContent(editor, caret, root);
    if (!insertedRange || !preservesStructure(insertedRange, root, editor)) {
      return fail("reconciled-structure-mismatch");
    }
    return { inserted: true, batchDurationsMs: durations, insertedRange };
  } catch {
    return fail("model-insertion-failed");
  } finally {
    observer.disconnect();
  }
}

function locateInsertedContent(editor: HTMLElement, caret: Range, expected: HTMLElement): Range | null {
  const expectedText = (expected.textContent ?? "").replace(/\s/g, "");
  let remaining = expectedText.length;
  let images = expected.querySelectorAll("img").length;
  let node: Node | null = caret.endContainer;
  let offset = caret.endOffset;
  const range = caret.cloneRange();
  let scanned = 0;
  for (let visited = 0; node && visited < MAX_SCAN_NODES; visited += 1) {
    if (node.nodeType === 3) {
      const data = node.textContent ?? "";
      for (let index = offset - 1; index >= 0; index -= 1) {
        if (++scanned > MAX_SCAN_CHARACTERS) return null;
        if (/\s/.test(data[index])) continue;
        if (remaining <= 0 || data[index] !== expectedText[remaining - 1]) return null;
        remaining -= 1;
        range.setStart(node, index);
        if (remaining === 0 && images === 0) return includeLeadingEmptyBlocks(range, expected, editor);
      }
    } else if ((node as Element).tagName === "IMG") {
      images -= 1;
      range.setStartBefore(node);
      if (remaining === 0 && images === 0) return includeLeadingEmptyBlocks(range, expected, editor);
    } else if (offset > 0) {
      node = node.childNodes[offset - 1];
      offset = node.nodeType === 3 ? (node.textContent ?? "").length : node.childNodes.length;
      continue;
    }
    node = previousNode(editor, node);
    offset = node?.nodeType === 3 ? (node.textContent ?? "").length : 0;
  }
  return null;
}

function includeLeadingEmptyBlocks(range: Range, expected: HTMLElement, editor: HTMLElement): Range {
  let block = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  while (block?.parentElement && block.parentElement !== editor) block = block.parentElement;
  let leading = 0;
  for (const child of Array.from(expected.children)) {
    if (!BLOCKS.test(child.tagName) || child.textContent?.trim() || child.querySelector("img")) break;
    leading += 1;
  }
  for (let index = 0; block && index < leading; index += 1) {
    const previous = block.previousElementSibling;
    if (!previous || !BLOCKS.test(previous.tagName)) break;
    // The first pasted empty paragraph can share a block with pre-existing
    // prefix text. Include its trailing boundary without including that text.
    if (index === leading - 1 && previous.textContent) range.setStart(previous, previous.childNodes.length);
    else range.setStartBefore(previous);
    block = previous;
  }
  return range;
}

function preservesStructure(range: Range, expected: HTMLElement, editor: HTMLElement): boolean {
  const actual = editor.ownerDocument.createElement("div");
  let fragment: Node = range.cloneContents();
  let ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType === 3) ancestor = ancestor.parentNode!;
  // cloneContents omits common ancestors; restore only that path in the
  // detached verification fragment, not in the live editor.
  while (ancestor && ancestor !== editor) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(fragment);
    fragment = wrapper;
    ancestor = ancestor.parentNode!;
  }
  actual.append(fragment);
  for (const tag of ["ul", "ol", "li", "img"]) {
    if (actual.querySelectorAll(tag).length !== expected.querySelectorAll(tag).length) return false;
  }
  if (JSON.stringify(listStructure(actual)) !== JSON.stringify(listStructure(expected))) return false;
  // Empty paragraphs and hard breaks matter even if textContent is identical.
  const blockCount = (root: Element) => root.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,blockquote,pre").length;
  if (blockCount(actual) < blockCount(expected)) return false;
  for (const selectors of ["strong,b", "em,i", "u", "s,strike,del"]) {
    const markedText = (root: HTMLElement) => Array.from(root.querySelectorAll(selectors))
      .filter(element => !element.parentElement?.closest(selectors))
      .map(element => element.textContent ?? "").join("").replace(/\s/g, "");
    if (markedText(expected) !== markedText(actual)) return false;
  }
  const breaks = (root: Element) => Array.from(root.querySelectorAll("br")).filter(br => !br.classList.contains("ProseMirror-trailingBreak") && br.parentElement?.childNodes.length !== 1).length;
  if (breaks(actual) < breaks(expected)) return false;
  const urls = (root: Element) => Array.from(root.querySelectorAll("a[href],img[src]")).map(element => element.getAttribute("href") ?? element.getAttribute("src"));
  return JSON.stringify(urls(actual)) === JSON.stringify(urls(expected));
}

function listStructure(root: HTMLElement): unknown[] {
  return Array.from(root.querySelectorAll("ol,ul")).map(list => {
    const path: number[] = [];
    let parentItem = list.parentElement?.closest("li");
    while (parentItem && root.contains(parentItem)) {
      const siblings = Array.from(parentItem.parentElement?.children ?? []).filter(child => child.tagName === "LI");
      path.unshift(siblings.indexOf(parentItem));
      parentItem = parentItem.parentElement?.parentElement?.closest("li");
    }
    return [list.tagName, Number(list.getAttribute("start") ?? 1),
      Array.from(list.children).filter(child => child.tagName === "LI").length, path];
  });
}

export function findPlaceholderInRange(editor: HTMLElement, searchRange: Range, maximumCharacters = MAX_SCAN_CHARACTERS): Range | null {
  const root = searchRange.commonAncestorContainer;
  const walker = editor.ownerDocument.createTreeWalker(root, 5);
  // Begin at the insertion/caret, not the first node of a possibly huge editor.
  walker.currentNode = searchRange.startContainer;
  let node: Node | null = searchRange.startContainer;
  if (node.nodeType !== 3) {
    const child = node.childNodes[searchRange.startOffset];
    if (child) {
      walker.currentNode = child;
      node = child.nodeType === 3 ? child : walker.nextNode();
    } else node = walker.nextNode();
  }
  let characters = 0;
  let buffer = "";
  let block: Element | null = null;
  let segments: { node: Node; offset: number; index: number; length: number }[] = [];
  for (let count = 0; node && count < MAX_SCAN_NODES && characters < MAX_SCAN_CHARACTERS; count += 1) {
    if (!searchRange.intersectsNode(node)) break;
    if (node.nodeType !== 3) {
      if ((node as Element).tagName === "BR" || (node as Element).tagName === "IMG") {
        buffer = "";
        segments = [];
      }
      node = walker.nextNode();
      continue;
    }
    {
      const currentBlock = node.parentElement?.closest("p,div,li,h1,h2,h3,h4,h5,h6,pre,blockquote") ?? null;
      if (currentBlock !== block) { buffer = ""; segments = []; block = currentBlock; }
      const start = node === searchRange.startContainer ? searchRange.startOffset : 0;
      const end = node === searchRange.endContainer ? searchRange.endOffset : (node.textContent ?? "").length;
      const text = (node.textContent ?? "").slice(start, Math.min(end, start + maximumCharacters - characters));
      characters += text.length;
      segments.push({ node, offset: start, index: buffer.length, length: text.length });
      buffer += text;
      const match = /%[^%\r\n]+%/.exec(buffer);
      if (match) {
        const first = segments.find(segment => segment.index + segment.length > match.index)!;
        const lastIndex = match.index + match[0].length;
        const last = segments.find(segment => segment.index + segment.length >= lastIndex)!;
        const range = editor.ownerDocument.createRange();
        range.setStart(first.node, first.offset + match.index - first.index);
        range.setEnd(last.node, last.offset + lastIndex - last.index);
        return range;
      }
    }
    if (characters >= maximumCharacters) break;
    node = walker.nextNode();
  }
  return null;
}

export function selectInsertedPlaceholder(editor: HTMLElement, insertedRange: Range): boolean {
  const range = findPlaceholderInRange(editor, insertedRange);
  if (range) {
    selectRange(editor, range);
    return true;
  }
  return false;
}
