import { findIndexedMacro, type MacroSnapshot } from "../macroIndex.ts";
import type { HubSpotPayloadPlan } from "../hubspotPolicy.ts";

export { classifyHubSpotPayload } from "../hubspotPolicy.ts";
export type {
  HubSpotExpansionStrategy,
  HubSpotPayloadPlan,
} from "../hubspotPolicy.ts";
const PLACEHOLDER_PATTERN = /%[^%\r\n]+%/g;
const SHOW_TEXT = 4;
const STRUCTURED_BATCH_MAX_CHARACTERS = 8 * 1024;
const STRUCTURED_BATCH_MAX_ELEMENTS = 30;
const STRUCTURED_MAX_BATCHES = 100;
const MAX_SAFE_IMAGES = 3;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_IMAGE_DIMENSION = 1600;
const PLACEHOLDER_SEARCH_MAX_NODES = 200;
const PLACEHOLDER_SEARCH_MAX_CHARACTERS = 64 * 1024;
const activeExpansions = new WeakSet<HTMLElement>();

const ALLOWED_ELEMENTS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DEL",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "IMG",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRIKE",
  "STRONG",
  "U",
  "UL",
]);
const REMOVED_ELEMENTS = new Set([
  "AUDIO",
  "EMBED",
  "IFRAME",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "SVG",
  "VIDEO",
]);

export type HubSpotExpansionResult =
  | "expanded"
  | "no-match"
  | "blocked"
  | "failed";

export interface HubSpotEditorLookup {
  eventTarget: EventTarget | null;
  eventPath: readonly EventTarget[];
  activeElement: Element | null;
  selection: Selection | null;
  hostname?: string;
}

export interface PreparedHubSpotHtml {
  html: string;
  batches: string[];
  acceptedImages: number;
  rejectedImages: number;
}

export interface StructuredInsertionResult {
  inserted: boolean;
  batchDurationsMs: number[];
}

export function isHubSpotPage(
  hostname = window.location.hostname,
): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === "hubspot.com" ||
    normalizedHostname.endsWith(".hubspot.com")
  );
}

export function findHubSpotEditor(
  lookup: HubSpotEditorLookup,
): HTMLElement | null {
  const hostname = lookup.hostname ?? window.location.hostname;
  if (!isHubSpotPage(hostname)) return null;

  const sources = [
    lookup.eventTarget,
    ...lookup.eventPath,
    lookup.activeElement,
  ];
  const seen = new Set<HTMLElement>();
  for (const source of sources) {
    const editor = findEditingHost(source);
    if (!editor || seen.has(editor)) continue;
    seen.add(editor);
    if (isExcludedField(editor)) continue;
    const anchorNode = lookup.selection?.anchorNode;
    if (anchorNode && editor.contains(anchorNode)) return editor;
  }
  return null;
}

export async function expandHubSpotMacro(
  editor: HTMLElement,
  snapshot: MacroSnapshot,
): Promise<HubSpotExpansionResult> {
  return (
    (await runExclusiveHubSpotExpansion(editor, () =>
      performHubSpotExpansion(editor, snapshot),
    )) ?? "failed"
  );
}

export async function runExclusiveHubSpotExpansion<T>(
  editor: HTMLElement,
  action: () => Promise<T>,
): Promise<T | null> {
  if (activeExpansions.has(editor)) return null;
  activeExpansions.add(editor);
  try {
    return await action();
  } finally {
    activeExpansions.delete(editor);
  }
}

async function performHubSpotExpansion(
  editor: HTMLElement,
  snapshot: MacroSnapshot,
): Promise<HubSpotExpansionResult> {
  const startedAt = performance.now();
  const valueBeforeCursor = getTextBeforeCursor(
    editor,
    snapshot.maxShortcutLength,
  );
  const match = findIndexedMacro(snapshot, valueBeforeCursor);
  if (!match) {
    return insertTextAtSelection(editor, " ") ? "no-match" : "failed";
  }

  const plan = match.hubspotPlan;
  if (plan.strategy === "blocked") {
    insertTextAtSelection(editor, " ");
    logHubSpotPerformance(
      plan,
      { html: "", batches: [], acceptedImages: 0, rejectedImages: plan.images },
      0,
      [performance.now() - startedAt],
      true,
    );
    return "blocked";
  }

  if (plan.strategy === "structured") await yieldToBrowser();
  const preparationStartedAt = performance.now();
  const prepared = prepareHubSpotHtml(match.macro.textoExpandido);
  const preparationMs = performance.now() - preparationStartedAt;
  if (
    prepared.batches.length === 0 ||
    prepared.batches.length > STRUCTURED_MAX_BATCHES
  ) {
    logHubSpotPerformance(plan, prepared, preparationMs, [], true);
    return "blocked";
  }
  if (plan.strategy === "structured") await yieldToBrowser();

  if (!selectCharactersBeforeCursor(editor, match.shortcutLength)) {
    logHubSpotPerformance(plan, prepared, preparationMs, [], true);
    return "failed";
  }

  const insertion =
    plan.strategy === "rich"
      ? insertSingleRichBatch(editor, prepared.html)
      : await insertStructuredBatches(editor, prepared.batches);
  logHubSpotPerformance(
    plan,
    prepared,
    preparationMs,
    insertion.batchDurationsMs,
    !insertion.inserted,
  );
  if (insertion.inserted) {
    selectFirstHubSpotPlaceholder(editor);
    measureHubSpotResponsiveness(plan, performance.now());
  }
  return insertion.inserted ? "expanded" : "failed";
}

export function sanitizeHubSpotHtml(
  html: string,
  ownerDocument: Document = document,
): string {
  return prepareHubSpotHtml(html, ownerDocument).html;
}

export function prepareHubSpotHtml(
  html: string,
  ownerDocument: Document = document,
): PreparedHubSpotHtml {
  const container = ownerDocument.createElement("div");
  container.innerHTML = html;
  const imageStats = sanitizeElements(container, ownerDocument);
  addPlaceholderMarkers(container, ownerDocument);
  const sanitizedHtml = container.innerHTML;
  return {
    html: sanitizedHtml,
    batches: createStructuredBatches(container, ownerDocument),
    ...imageStats,
  };
}

export function htmlToHubSpotPlainText(
  html: string,
  ownerDocument: Document = document,
): string {
  const container = ownerDocument.createElement("div");
  container.innerHTML = html;
  sanitizeElements(container, ownerDocument);
  return renderPlainText(container)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function findEditingHost(source: EventTarget | null): HTMLElement | null {
  if (!(source instanceof HTMLElement)) return null;
  let element: HTMLElement | null = source;
  while (element) {
    const editable = element.getAttribute("contenteditable")?.toLowerCase();
    if (
      editable === "true" ||
      editable === "plaintext-only" ||
      (element.isContentEditable && element.getAttribute("role") === "textbox")
    ) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function isExcludedField(editor: HTMLElement): boolean {
  return (
    editor.getAttribute("role") === "searchbox" ||
    Boolean(editor.closest('[role="search"], header, nav, [role="navigation"]'))
  );
}

function sanitizeElements(
  root: ParentNode,
  ownerDocument: Document,
): { acceptedImages: number; rejectedImages: number } {
  let acceptedImages = 0;
  let rejectedImages = 0;
  const elements = Array.from(root.querySelectorAll("*"));
  elements.forEach((element) => {
    if (!element.parentNode) return;
    if (REMOVED_ELEMENTS.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!ALLOWED_ELEMENTS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    if (element.tagName === "IMG") {
      if (sanitizeImage(element, acceptedImages)) {
        acceptedImages += 1;
      } else {
        rejectedImages += 1;
        const alt = element.getAttribute("alt")?.trim();
        element.replaceWith(
          alt ? ownerDocument.createTextNode(`[Imagem: ${alt}]`) : ownerDocument.createTextNode(""),
        );
      }
      return;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    const orderedListStart =
      element.tagName === "OL" ? normalizePositiveInteger(element.getAttribute("start")) : null;
    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });
    if (href && isSafeLink(href)) element.setAttribute("href", href);
    if (orderedListStart) element.setAttribute("start", orderedListStart);
  });
  return { acceptedImages, rejectedImages };
}

function isSafeLink(href: string): boolean {
  return /^(https:|mailto:|tel:)/i.test(href.trim());
}

function sanitizeImage(element: Element, acceptedImages: number): boolean {
  const src = element.getAttribute("src")?.trim() ?? "";
  const width = normalizeDimension(element.getAttribute("width"));
  const height = normalizeDimension(element.getAttribute("height"));
  const isTrackingPixel =
    (width !== null && width <= 1) || (height !== null && height <= 1);
  if (
    acceptedImages >= MAX_SAFE_IMAGES ||
    src.length === 0 ||
    src.length > MAX_IMAGE_URL_LENGTH ||
    !isSafeHttpsImageUrl(src) ||
    isTrackingPixel
  ) {
    return false;
  }

  const alt = element.getAttribute("alt")?.trim() ?? "";
  Array.from(element.attributes).forEach((attribute) => {
    element.removeAttribute(attribute.name);
  });
  element.setAttribute("src", src);
  if (alt) element.setAttribute("alt", alt);
  if (width !== null) element.setAttribute("width", String(width));
  if (height !== null) element.setAttribute("height", String(height));
  return true;
}

function isSafeHttpsImageUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizeDimension(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value), MAX_IMAGE_DIMENSION);
}

function normalizePositiveInteger(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) return null;
  return String(Number(value));
}

function createStructuredBatches(
  root: HTMLElement,
  ownerDocument: Document,
): string[] {
  const units = Array.from(root.childNodes).flatMap((node) =>
    createSemanticUnits(node, ownerDocument),
  );
  const batches: string[] = [];
  let currentHtml = "";
  let currentElements = 0;

  units.forEach((unit) => {
    const exceedsBatch =
      currentHtml.length > 0 &&
      (currentHtml.length + unit.html.length > STRUCTURED_BATCH_MAX_CHARACTERS ||
        currentElements + unit.elements > STRUCTURED_BATCH_MAX_ELEMENTS);
    if (exceedsBatch) {
      batches.push(currentHtml);
      currentHtml = "";
      currentElements = 0;
    }
    currentHtml += unit.html;
    currentElements += unit.elements;
  });
  if (currentHtml) batches.push(currentHtml);
  return batches;
}

function createSemanticUnits(
  node: Node,
  ownerDocument: Document,
  maximumCharacters = STRUCTURED_BATCH_MAX_CHARACTERS,
  maximumElements = STRUCTURED_BATCH_MAX_ELEMENTS,
): Array<{ html: string; elements: number }> {
  if (node.nodeType !== 1) {
    return splitSerializedText(node.textContent ?? "", ownerDocument, maximumCharacters);
  }
  const element = node as Element;
  if ((element.tagName === "OL" || element.tagName === "UL") && element.children.length) {
    return splitList(element, maximumCharacters, maximumElements);
  }
  const html = element.outerHTML;
  const elements = countElements(element);
  if (
    html.length <= maximumCharacters &&
    elements <= maximumElements
  ) {
    return [{ html, elements }];
  }

  const clone = element.cloneNode(false) as Element;
  const opening = clone.outerHTML.replace(/<\/[^>]+>$/, "");
  const closing = `</${element.tagName.toLowerCase()}>`;
  const availableCharacters = Math.max(
    1,
    maximumCharacters - opening.length - closing.length,
  );
  const childUnits = Array.from(element.childNodes).flatMap((child) => {
    if (child.nodeType === 3) {
      return splitTextForHtml(child.textContent ?? "", availableCharacters).map((part) => ({
        html: escapeHtml(part, ownerDocument),
        elements: 0,
      }));
    }
    return createSemanticUnits(
      child,
      ownerDocument,
      availableCharacters,
      Math.max(1, maximumElements - 1),
    );
  });
  const wrapped: Array<{ html: string; elements: number }> = [];
  let innerHtml = "";
  let innerElements = 0;
  childUnits.forEach((unit) => {
    const exceeds =
      innerHtml.length > 0 &&
      (opening.length + innerHtml.length + unit.html.length + closing.length >
        maximumCharacters ||
        innerElements + unit.elements + 1 > maximumElements);
    if (exceeds) {
      wrapped.push({
        html: `${opening}${innerHtml}${closing}`,
        elements: innerElements + 1,
      });
      innerHtml = "";
      innerElements = 0;
    }
    innerHtml += unit.html;
    innerElements += unit.elements;
  });
  if (innerHtml) {
    wrapped.push({
      html: `${opening}${innerHtml}${closing}`,
      elements: innerElements + 1,
    });
  }
  return wrapped;
}

function splitList(
  list: Element,
  maximumCharacters: number,
  maximumElements: number,
): Array<{ html: string; elements: number }> {
  const chunks: Array<{ html: string; elements: number }> = [];
  const items = Array.from(list.children).filter((child) => child.tagName === "LI");
  const tag = list.tagName.toLowerCase();
  const closing = `</${tag}>`;
  let currentItemsHtml = "";
  let currentItemCount = 0;
  let currentElements = 1;
  let consumedItems = 0;
  const originalStart = Number(list.getAttribute("start") ?? "1") || 1;
  const opening = () =>
    list.tagName === "OL" && originalStart + consumedItems !== 1
      ? `<ol start="${originalStart + consumedItems}">`
      : `<${tag}>`;

  const flush = () => {
    if (currentItemCount === 0) return;
    chunks.push({
      html: `${opening()}${currentItemsHtml}${closing}`,
      elements: currentElements,
    });
    consumedItems += currentItemCount;
    currentItemsHtml = "";
    currentItemCount = 0;
    currentElements = 1;
  };

  items.forEach((item) => {
    const itemElements = countElements(item);
    const itemHtml = item.outerHTML;
    if (
      currentItemCount > 0 &&
      (opening().length + currentItemsHtml.length + itemHtml.length + closing.length >
        maximumCharacters ||
        currentElements + itemElements > maximumElements)
    ) {
      flush();
    }
    currentItemsHtml += itemHtml;
    currentItemCount += 1;
    currentElements += itemElements;
  });
  flush();
  return chunks;
}

function splitSerializedText(
  text: string,
  ownerDocument: Document,
  maximumCharacters: number,
): Array<{ html: string; elements: number }> {
  return splitTextForHtml(text, maximumCharacters).map((part) => ({
    html: escapeHtml(part, ownerDocument),
    elements: 0,
  }));
}

function splitTextForHtml(text: string, maximum: number): string[] {
  const parts: string[] = [];
  let current = "";
  let serializedLength = 0;
  for (const character of text) {
    const characterLength = escapedTextLength(character);
    if (current.length > 0 && serializedLength + characterLength > maximum) {
      parts.push(current);
      current = "";
      serializedLength = 0;
    }
    current += character;
    serializedLength += characterLength;
  }
  if (current) parts.push(current);
  return parts;
}

function escapedTextLength(character: string): number {
  if (character === "&") return 5;
  if (character === "<" || character === ">") return 4;
  return character.length;
}

function escapeHtml(text: string, ownerDocument: Document): string {
  const container = ownerDocument.createElement("div");
  container.textContent = text;
  return container.innerHTML;
}

function countElements(element: Element): number {
  return 1 + element.querySelectorAll("*").length;
}

function addPlaceholderMarkers(
  root: Node,
  ownerDocument: Document,
): void {
  const walker = ownerDocument.createTreeWalker(root, SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const text = textNode.data;
    PLACEHOLDER_PATTERN.lastIndex = 0;
    if (!PLACEHOLDER_PATTERN.test(text)) return;
    PLACEHOLDER_PATTERN.lastIndex = 0;

    const fragment = ownerDocument.createDocumentFragment();
    let cursor = 0;
    let match = PLACEHOLDER_PATTERN.exec(text);
    while (match) {
      fragment.append(text.slice(cursor, match.index));
      const marker = ownerDocument.createElement("span");
      marker.dataset.lilackeysPlaceholder = "true";
      marker.textContent = match[0];
      fragment.append(marker);
      cursor = match.index + match[0].length;
      match = PLACEHOLDER_PATTERN.exec(text);
    }
    fragment.append(text.slice(cursor));
    textNode.replaceWith(fragment);
  });
}

interface PlaceholderSelectionOptions {
  getSelection?: () => Selection | null;
  createRange?: () => Range;
}

interface PlaceholderNavigationEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function selectFirstHubSpotPlaceholder(
  editor: HTMLElement,
  options: PlaceholderSelectionOptions = {},
): boolean {
  const placeholder = editor.querySelector<HTMLElement>(
    "[data-lilackeys-placeholder]",
  );
  if (!placeholder) return false;

  const selection =
    options.getSelection?.() ?? editor.ownerDocument.defaultView?.getSelection();
  if (!selection) return false;
  const range = options.createRange?.() ?? editor.ownerDocument.createRange();
  range.selectNodeContents(placeholder);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

export function handleHubSpotPlaceholderTab(
  event: PlaceholderNavigationEvent,
  editor: HTMLElement,
  selection: Selection | null,
  options: Pick<PlaceholderSelectionOptions, "createRange"> = {},
): boolean {
  if (event.key !== "Tab" || event.shiftKey) return false;
  if (!moveToNextHubSpotPlaceholder(editor, selection, options)) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function moveToNextHubSpotPlaceholder(
  editor: HTMLElement,
  selection: Selection | null,
  options: Pick<PlaceholderSelectionOptions, "createRange"> = {},
): boolean {
  const anchorNode = selection?.anchorNode;
  if (!selection || !anchorNode || !editor.contains(anchorNode)) return false;

  const start = getForwardTextPosition(editor, anchorNode, selection.anchorOffset);
  if (!start) return false;
  const currentMarker = findPlaceholderAncestor(anchorNode, editor);
  const nextMarker = findNextMarkedPlaceholder(editor, start, currentMarker);
  const range = options.createRange?.() ?? editor.ownerDocument.createRange();
  if (nextMarker) {
    range.selectNodeContents(nextMarker);
  } else {
    const match = findNextPlaceholderText(editor, start);
    if (!match) return false;
    range.setStart(match.node, match.start);
    range.setEnd(match.node, match.end);
  }

  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

interface TextPosition {
  node: Text;
  offset: number;
}

function getForwardTextPosition(
  editor: HTMLElement,
  anchorNode: Node,
  anchorOffset: number,
): TextPosition | null {
  if (anchorNode.nodeType === 3) {
    const text = anchorNode as Text;
    return { node: text, offset: Math.min(anchorOffset, text.data.length) };
  }

  const child = anchorNode.childNodes[anchorOffset];
  const text = child ? findFirstTextNode(child) : null;
  if (text) return { node: text, offset: 0 };
  const next = findNextTextNode(editor, child ?? anchorNode);
  return next ? { node: next, offset: 0 } : null;
}

function findNextMarkedPlaceholder(
  editor: HTMLElement,
  start: TextPosition,
  currentMarker: HTMLElement | null,
): HTMLElement | null {
  let node: Text | null = start.node;
  let inspectedNodes = 0;
  let inspectedCharacters = 0;
  while (
    node &&
    inspectedNodes < PLACEHOLDER_SEARCH_MAX_NODES &&
    inspectedCharacters <= PLACEHOLDER_SEARCH_MAX_CHARACTERS
  ) {
    const marker = findPlaceholderAncestor(node, editor);
    if (marker && marker !== currentMarker) return marker;
    inspectedNodes += 1;
    inspectedCharacters += node.data.length;
    node = findNextTextNode(editor, node);
  }
  return null;
}

function findNextPlaceholderText(
  editor: HTMLElement,
  start: TextPosition,
): { node: Text; start: number; end: number } | null {
  let node: Text | null = start.node;
  let offset = start.offset;
  let inspectedNodes = 0;
  let inspectedCharacters = 0;
  while (
    node &&
    inspectedNodes < PLACEHOLDER_SEARCH_MAX_NODES &&
    inspectedCharacters <= PLACEHOLDER_SEARCH_MAX_CHARACTERS
  ) {
    const available = node.data.slice(offset);
    const match = /%[^%\r\n]+%/.exec(available);
    if (match) {
      const matchStart = offset + match.index;
      return {
        node,
        start: matchStart,
        end: matchStart + match[0].length,
      };
    }
    inspectedNodes += 1;
    inspectedCharacters += available.length;
    node = findNextTextNode(editor, node);
    offset = 0;
  }
  return null;
}

function findPlaceholderAncestor(
  node: Node,
  editor: HTMLElement,
): HTMLElement | null {
  let element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (element && element !== editor) {
    if (element.hasAttribute("data-lilackeys-placeholder")) return element;
    element = element.parentElement;
  }
  return null;
}

function findFirstTextNode(node: Node): Text | null {
  if (node.nodeType === 3) return node as Text;
  for (const child of Array.from(node.childNodes)) {
    const text = findFirstTextNode(child);
    if (text) return text;
  }
  return null;
}

function findNextTextNode(root: Node, node: Node): Text | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nextSibling) {
      const text = findFirstTextNode(current.nextSibling);
      if (text) return text;
      current = current.nextSibling;
      continue;
    }
    current = current.parentNode;
  }
  return null;
}

function renderPlainText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1 && node.nodeType !== 11) return "";

  const element = node.nodeType === 1 ? (node as Element) : null;
  const tagName = element?.tagName;
  if (tagName === "BR") return "\n";

  let content = Array.from(node.childNodes).map(renderPlainText).join("");
  if (tagName === "A") {
    const href = element?.getAttribute("href");
    if (href && !content.includes(href)) content += ` (${href})`;
  }
  if (tagName === "LI") content = `- ${content}\n`;
  else if (
    tagName &&
    ["BLOCKQUOTE", "DIV", "OL", "P", "PRE", "UL"].includes(tagName)
  ) {
    content += "\n";
  }
  return content;
}

function getTextBeforeCursor(editor: HTMLElement, maxLength: number): string {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !editor.contains(selection.anchorNode) ||
    maxLength <= 0
  ) {
    return "";
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(editor);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().slice(-maxLength);
}

function selectCharactersBeforeCursor(
  editor: HTMLElement,
  length: number,
): boolean {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return false;
  const editableSelection = selection as Selection & {
    modify?: (
      alter: "move" | "extend",
      direction: "forward" | "backward",
      granularity: "character",
    ) => void;
  };
  if (!editableSelection.modify) return false;
  editableSelection.collapseToEnd();
  for (let index = 0; index < length; index += 1) {
    editableSelection.modify("extend", "backward", "character");
  }
  return !editableSelection.isCollapsed;
}

function insertHtmlAtSelection(editor: HTMLElement, html: string): boolean {
  const before = editor.innerHTML;
  const commandSucceeded = document.execCommand("insertHTML", false, html);
  return commandSucceeded || editor.innerHTML !== before;
}

function insertSingleRichBatch(
  editor: HTMLElement,
  html: string,
): StructuredInsertionResult {
  const startedAt = performance.now();
  const inserted = insertHtmlAtSelection(editor, html);
  return {
    inserted,
    batchDurationsMs: [performance.now() - startedAt],
  };
}

interface StructuredInsertionOptions {
  insertHtml?: (editor: HTMLElement, html: string) => boolean;
  yieldFrame?: () => Promise<void>;
  selectionBelongs?: (editor: HTMLElement) => boolean;
  now?: () => number;
}

export async function insertStructuredBatches(
  editor: HTMLElement,
  batches: readonly string[],
  options: StructuredInsertionOptions = {},
): Promise<StructuredInsertionResult> {
  const insertHtml = options.insertHtml ?? insertHtmlAtSelection;
  const yieldFrame = options.yieldFrame ?? yieldToBrowser;
  const selectionBelongs = options.selectionBelongs ?? selectionBelongsToEditor;
  const now = options.now ?? (() => performance.now());
  const valid =
    batches.length > 0 &&
    batches.length <= STRUCTURED_MAX_BATCHES &&
    batches.every(
      (batch) =>
        batch.length <= STRUCTURED_BATCH_MAX_CHARACTERS &&
        estimateBatchElements(batch) <= STRUCTURED_BATCH_MAX_ELEMENTS,
    );
  if (!valid || !selectionBelongs(editor)) {
    return { inserted: false, batchDurationsMs: [] };
  }

  const batchDurationsMs: number[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    if (!selectionBelongs(editor)) {
      return { inserted: false, batchDurationsMs };
    }
    const startedAt = now();
    if (!insertHtml(editor, batches[index])) {
      return { inserted: false, batchDurationsMs };
    }
    batchDurationsMs.push(now() - startedAt);
    if (!selectionBelongs(editor)) {
      return { inserted: false, batchDurationsMs };
    }
    if (index < batches.length - 1) await yieldFrame();
  }
  return { inserted: true, batchDurationsMs };
}

function selectionBelongsToEditor(editor: HTMLElement): boolean {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const activeElement = editor.ownerDocument.activeElement;
  return Boolean(
    anchor &&
      editor.contains(anchor) &&
      activeElement &&
      (activeElement === editor || editor.contains(activeElement)),
  );
}

function estimateBatchElements(html: string): number {
  return (html.match(/<\s*[a-z][a-z0-9-]*\b/gi) ?? []).length;
}

function insertTextAtSelection(editor: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return false;
  const before = editor.textContent;
  const commandSucceeded = document.execCommand("insertText", false, text);
  if (commandSucceeded || editor.textContent !== before) return true;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: text,
      inputType: "insertText",
    }),
  );
  return true;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function logHubSpotPerformance(
  plan: HubSpotPayloadPlan,
  prepared: PreparedHubSpotHtml,
  preparationMs: number,
  batchDurationsMs: readonly number[],
  failed: boolean,
): void {
  const details = {
    strategy: plan.strategy,
    characters: plan.characters,
    estimatedElements: plan.estimatedElements,
    complexity: plan.complexity,
    batches: prepared.batches.length,
    acceptedImages: prepared.acceptedImages,
    rejectedImages: prepared.rejectedImages,
    preparationMs: roundDuration(preparationMs),
    batchDurationsMs: batchDurationsMs.map(roundDuration),
  };
  if (failed) console.warn("LilacKeys: expansão no HubSpot não concluída", details);
  else console.info("LilacKeys: expansão no HubSpot concluída", details);
}

export function measureHubSpotResponsiveness(
  plan: HubSpotPayloadPlan,
  startedAt: number,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
): void {
  schedule(() => {
    schedule(() => {
      console.info("LilacKeys: responsividade após expansão no HubSpot", {
        strategy: plan.strategy,
        characters: plan.characters,
        estimatedElements: plan.estimatedElements,
        complexity: plan.complexity,
        nextFramesMs: roundDuration(performance.now() - startedAt),
      });
    });
  });
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}
