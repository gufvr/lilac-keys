import { findIndexedMacro, type MacroSnapshot } from "../macroIndex.ts";
import type { HubSpotPayloadPlan } from "../hubspotPolicy.ts";

export { classifyHubSpotPayload } from "../hubspotPolicy.ts";
export type {
  HubSpotExpansionStrategy,
  HubSpotPayloadPlan,
} from "../hubspotPolicy.ts";
const PLACEHOLDER_PATTERN = /%[^%\r\n]+%/g;
const SHOW_TEXT = 4;

const ALLOWED_ELEMENTS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DEL",
  "DIV",
  "EM",
  "I",
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
  "IMG",
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
    logHubSpotPerformance(plan, 0, performance.now() - startedAt, true);
    return "blocked";
  }

  if (plan.strategy === "plain") await yieldToBrowser();
  const preparationStartedAt = performance.now();
  const preparedContent =
    plan.strategy === "rich"
      ? sanitizeHubSpotHtml(match.macro.textoExpandido)
      : htmlToHubSpotPlainText(match.macro.textoExpandido);
  const preparationMs = performance.now() - preparationStartedAt;
  if (plan.strategy === "plain") await yieldToBrowser();

  if (!selectCharactersBeforeCursor(editor, match.shortcutLength)) {
    logHubSpotPerformance(plan, preparationMs, 0, true);
    return "failed";
  }

  const insertionStartedAt = performance.now();
  const inserted =
    plan.strategy === "rich"
      ? insertHtmlAtSelection(editor, preparedContent)
      : insertTextAtSelection(editor, preparedContent);
  const insertionMs = performance.now() - insertionStartedAt;
  logHubSpotPerformance(plan, preparationMs, insertionMs, !inserted);
  if (inserted) measureHubSpotResponsiveness(plan, performance.now());
  return inserted ? "expanded" : "failed";
}

export function sanitizeHubSpotHtml(
  html: string,
  ownerDocument: Document = document,
): string {
  const container = ownerDocument.createElement("div");
  container.innerHTML = html;
  sanitizeElements(container);
  addPlaceholderMarkers(container, ownerDocument);
  return container.innerHTML;
}

export function htmlToHubSpotPlainText(
  html: string,
  ownerDocument: Document = document,
): string {
  const container = ownerDocument.createElement("div");
  container.innerHTML = html;
  sanitizeElements(container);
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

function sanitizeElements(root: ParentNode): void {
  const elements = Array.from(root.querySelectorAll("*"));
  elements.forEach((element) => {
    if (REMOVED_ELEMENTS.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!ALLOWED_ELEMENTS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });
    if (href && isSafeLink(href)) element.setAttribute("href", href);
  });
}

function isSafeLink(href: string): boolean {
  return /^(https?:|mailto:|tel:|\/|#)/i.test(href.trim());
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
  preparationMs: number,
  insertionMs: number,
  failed: boolean,
): void {
  const details = {
    strategy: plan.strategy,
    characters: plan.characters,
    estimatedElements: plan.estimatedElements,
    complexity: plan.complexity,
    preparationMs: roundDuration(preparationMs),
    insertionMs: roundDuration(insertionMs),
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
