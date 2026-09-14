import type { Macro } from "../../types/macro";

const WHATSAPP_WEB_HOSTNAME = "web.whatsapp.com";

export interface WhatsAppComposerContext {
  hostname: string;
  isContentEditable: boolean;
  role: string | null;
  isLexicalEditor: boolean;
  insideMain: boolean;
  insideFooter: boolean;
  hasSendActionNearby: boolean;
  insideSearchRegion: boolean;
  insideSidePanel: boolean;
  insideHeader: boolean;
  insideNavigation: boolean;
  insideDialog: boolean;
  insideCaptionRegion: boolean;
  selectionInside: boolean;
}

export interface WhatsAppComposerLookup {
  eventTarget: EventTarget | null;
  eventPath: readonly EventTarget[];
  activeElement: Element | null;
  selection: Selection | null;
  hostname?: string;
}

export interface WhatsAppMacroMatch {
  macro: Macro;
  shortcutLength: number;
}

export type WhatsAppExpansionResult = "expanded" | "no-match" | "failed";

export function isWhatsAppWebPage(
  hostname = window.location.hostname,
): boolean {
  return hostname.toLowerCase() === WHATSAPP_WEB_HOSTNAME;
}

export function isWhatsAppMessageComposerContext(
  context: WhatsAppComposerContext,
): boolean {
  const isExcluded =
    context.insideSearchRegion ||
    context.insideSidePanel ||
    context.insideHeader ||
    context.insideNavigation ||
    context.insideDialog ||
    context.insideCaptionRegion;
  const hasEditorSemantics =
    context.role === "textbox" || context.isLexicalEditor;
  const hasComposerLocation =
    context.insideFooter ||
    context.insideMain ||
    (context.isLexicalEditor && context.hasSendActionNearby);

  return (
    isWhatsAppWebPage(context.hostname) &&
    context.isContentEditable &&
    hasEditorSemantics &&
    hasComposerLocation &&
    !isExcluded &&
    context.selectionInside
  );
}

export function orderWhatsAppEditorCandidates<T>(
  eventTarget: T | null,
  eventPath: readonly T[],
  activeElement: T | null,
  resolveEditor: (candidate: T) => T | null,
): T[] {
  const candidates: T[] = [];
  const addCandidate = (candidate: T | null) => {
    if (candidate === null) return;
    const editor = resolveEditor(candidate);
    if (editor !== null && !candidates.includes(editor)) candidates.push(editor);
  };

  addCandidate(eventTarget);
  eventPath.forEach(addCandidate);
  addCandidate(activeElement);
  return candidates;
}

export function findWhatsAppMacroMatch(
  macros: Macro[],
  valueBeforeCursor: string,
): WhatsAppMacroMatch | null {
  const normalizedValue = valueBeforeCursor.toLowerCase();
  let match: WhatsAppMacroMatch | null = null;

  for (const macro of macros) {
    const shortcut = macro.atalho.trim().toLowerCase();
    if (
      shortcut.length > (match?.shortcutLength ?? 0) &&
      normalizedValue.endsWith(shortcut)
    ) {
      match = { macro, shortcutLength: shortcut.length };
    }
  }

  return match;
}

export function findWhatsAppMessageComposer(
  lookup: WhatsAppComposerLookup,
): HTMLElement | null {
  const hostname = lookup.hostname ?? window.location.hostname;
  if (!isWhatsAppWebPage(hostname)) return null;
  const editors = orderWhatsAppEditorCandidates<EventTarget>(
    lookup.eventTarget,
    lookup.eventPath,
    lookup.activeElement,
    findEditingHost,
  );

  for (const candidate of editors) {
    const editor = candidate as HTMLElement;
    const context = describeComposerContext(
      editor,
      lookup.selection,
      hostname,
    );
    if (isWhatsAppMessageComposerContext(context)) return editor;
  }

  return null;
}

function findEditingHost(candidate: EventTarget): EventTarget | null {
  if (!(candidate instanceof HTMLElement)) return null;

  let element: HTMLElement | null = candidate;
  while (element) {
    const contentEditable = element.getAttribute("contenteditable")?.toLowerCase();
    const isExplicitlyEditable =
      contentEditable === "true" || contentEditable === "plaintext-only";
    const isLexicalEditor =
      element.getAttribute("data-lexical-editor") === "true";
    const isTextboxEditingHost =
      element.isContentEditable && element.getAttribute("role") === "textbox";

    if (isExplicitlyEditable || isLexicalEditor || isTextboxEditingHost) {
      return element;
    }
    element = element.parentElement;
  }

  return null;
}

function describeComposerContext(
  editor: HTMLElement,
  selection: Selection | null,
  hostname: string,
): WhatsAppComposerContext {
  const contentEditable = editor.getAttribute("contenteditable")?.toLowerCase();
  const isExplicitlyEditable =
    contentEditable === "true" || contentEditable === "plaintext-only";
  const role = editor.getAttribute("role");
  const isLexicalEditor = editor.getAttribute("data-lexical-editor") === "true";
  const anchorNode = selection?.anchorNode ?? null;

  return {
    hostname,
    isContentEditable:
      editor.isContentEditable || isExplicitlyEditable || isLexicalEditor,
    role,
    isLexicalEditor,
    insideMain: Boolean(editor.closest("#main")),
    insideFooter: Boolean(editor.closest("footer")),
    hasSendActionNearby: hasSendActionNearby(editor),
    insideSearchRegion:
      role === "searchbox" ||
      Boolean(
        editor.closest(
          '[role="search"], [data-testid*="search" i], [data-icon="search"]',
        ),
      ),
    insideSidePanel: Boolean(editor.closest("#side")),
    insideHeader: Boolean(editor.closest("header")),
    insideNavigation: Boolean(editor.closest('nav, [role="navigation"]')),
    insideDialog: Boolean(editor.closest('[role="dialog"]')),
    insideCaptionRegion: Boolean(
      editor.closest(
        '[data-testid*="caption" i], [data-testid*="media-editor" i]',
      ),
    ),
    selectionInside: Boolean(anchorNode && editor.contains(anchorNode)),
  };
}

function hasSendActionNearby(editor: HTMLElement): boolean {
  let container = editor.parentElement;
  for (let depth = 0; container && depth < 6; depth += 1) {
    if (
      container.querySelector(
        '[data-icon="send"], [data-testid="send"], button[type="submit"]',
      )
    ) {
      return true;
    }
    if (container.matches("#main, footer")) break;
    container = container.parentElement;
  }
  return false;
}

export function expandWhatsAppMacro(
  editor: HTMLElement,
  macros: Macro[],
  toPlainText: (html: string) => string,
): WhatsAppExpansionResult {
  const maxShortcutLength = macros.reduce(
    (maxLength, macro) => Math.max(maxLength, macro.atalho.trim().length),
    0,
  );
  const valueBeforeCursor = getTextBeforeCursor(editor, maxShortcutLength);
  const match = findWhatsAppMacroMatch(macros, valueBeforeCursor);

  if (!match) {
    return insertTextAtSelection(editor, " ") ? "no-match" : "failed";
  }

  if (!selectCharactersBeforeCursor(editor, match.shortcutLength)) {
    return "failed";
  }

  const expandedText = toPlainText(match.macro.textoExpandido);
  return insertTextAtSelection(editor, expandedText) ? "expanded" : "failed";
}

export function insertWhatsAppSpace(editor: HTMLElement): boolean {
  return insertTextAtSelection(editor, " ");
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
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !editor.contains(selection.anchorNode)
  ) {
    return false;
  }

  const editableSelection = selection as Selection & {
    modify?: (
      alter: "move" | "extend",
      direction: "forward" | "backward",
      granularity: "character",
    ) => void;
  };

  if (editableSelection.modify) {
    editableSelection.collapseToEnd();
    for (let index = 0; index < length; index += 1) {
      editableSelection.modify("extend", "backward", "character");
    }
    return !editableSelection.isCollapsed;
  }

  const caretRange = selection.getRangeAt(0).cloneRange();
  const prefixRange = caretRange.cloneRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(caretRange.endContainer, caretRange.endOffset);
  const targetOffset = prefixRange.toString().length - length;
  if (targetOffset < 0) return false;

  const start = findTextPosition(editor, targetOffset);
  if (!start) return false;

  const replacementRange = document.createRange();
  replacementRange.setStart(start.node, start.offset);
  replacementRange.setEnd(caretRange.endContainer, caretRange.endOffset);
  selection.removeAllRanges();
  selection.addRange(replacementRange);
  return true;
}

function findTextPosition(
  root: HTMLElement,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let node = walker.nextNode();

  while (node) {
    const text = node as Text;
    const nextOffset = traversed + text.data.length;
    if (targetOffset <= nextOffset) {
      return { node: text, offset: targetOffset - traversed };
    }
    traversed = nextOffset;
    node = walker.nextNode();
  }

  return null;
}

function insertTextAtSelection(editor: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !editor.contains(selection.anchorNode)
  ) {
    return false;
  }

  const textBeforeInsertion = editor.textContent;
  const commandSucceeded = document.execCommand("insertText", false, text);
  if (commandSucceeded || editor.textContent !== textBeforeInsertion) return true;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: text,
        inputType: "insertText",
      }),
    );
  } catch {
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return true;
}
