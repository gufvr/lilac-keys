// Convert the clipboard's common Markdown subset, never existing saved macros.
// HTML-rich clipboard data is left to the browser's normal paste handling.
export function markdownClipboardHtml(document: Document, text: string, html = ""): string | null {
  if (html.trim()) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const plainWrappers = new Set(["P", "DIV", "SPAN", "BR"]);
    for (const element of template.content.querySelectorAll("*")) {
      if (!plainWrappers.has(element.tagName)) return null;
      if (element.getAttribute("style")?.trim()) return null;
    }
    const compact = (value: string) => value.replace(/\s/gu, "");
    if (compact(template.content.textContent ?? "") !== compact(text)) return null;
  }

  const root = document.createElement("div");
  let formatted = false;
  const inline = (parent: HTMLElement, value: string) => {
    const pattern = /%[^%\n]+%|`[^`\n]+`|\*\*([^*\n]+)\*\*|__([^_\n]+)__/g;
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index;
      const code = match[0].startsWith("`");
      if (match[0].startsWith("%")) {
        parent.append(document.createTextNode(value.slice(cursor, index + match[0].length)));
        cursor = index + match[0].length;
        continue;
      }
      const delimiter = match[0][0];
      const content = code ? match[0].slice(1, -1) : match[1] ?? match[2];
      if (!code && (value[index - 1] === "\\" || value[index - 1] === delimiter ||
          value[index + match[0].length] === delimiter || content.trim() !== content)) continue;
      parent.append(document.createTextNode(value.slice(cursor, index)));
      const element = document.createElement(code ? "code" : "strong");
      element.textContent = content;
      parent.append(element);
      if (!code) formatted = true;
      cursor = index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(cursor)));
  };
  let paragraph: HTMLParagraphElement | null = null;
  const lists: { indent: number; kind: "ul" | "ol"; element: HTMLElement; item: HTMLLIElement | null }[] = [];
  let fence: { marker: string; length: number; lines: string[] } | null = null;
  const flushCode = () => {
    if (!fence) return;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = fence.lines.join("\n");
    pre.append(code); root.append(pre);
    fence = null;
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const boundary = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (boundary && boundary[1][0] === fence.marker && boundary[1].length >= fence.length && !boundary[2].trim()) flushCode();
      else fence.lines.push(line);
      continue;
    }
    if (boundary) {
      paragraph = null; lists.length = 0;
      fence = { marker: boundary[1][0], length: boundary[1].length, lines: [] };
      continue;
    }
    if (!line.trim()) { paragraph = null; lists.length = 0; continue; }
    const marker = line.match(/^([ \t]*)([-+*]|\d{1,9}\.)[ \t]+(.+)$/);
    if (marker && marker[3].trim()) {
      formatted = true;
      paragraph = null;
      const indent = marker[1].replace(/\t/g, "    ").length;
      const kind = /^\d/.test(marker[2]) ? "ol" : "ul";
      while (lists.length && (lists[lists.length - 1].indent > indent ||
          (lists[lists.length - 1].indent === indent && lists[lists.length - 1].kind !== kind))) lists.pop();
      let current = lists[lists.length - 1];
      if (!current || current.indent < indent) {
        const element = document.createElement(kind);
        const start = Number.parseInt(marker[2], 10);
        if (kind === "ol" && start !== 1) element.setAttribute("start", String(start));
        (current?.item ?? root).append(element);
        current = { indent, kind, element, item: null };
        lists.push(current);
      }
      const item = document.createElement("li");
      inline(item, marker[3]);
      current.element.append(item);
      current.item = item;
    } else {
      lists.length = 0;
      if (!paragraph) { paragraph = document.createElement("p"); root.append(paragraph); }
      else paragraph.append(document.createElement("br"));
      inline(paragraph, line);
    }
  }
  flushCode();
  return formatted ? root.innerHTML : null;
}

export function pasteMarkdownText(editor: HTMLElement, text: string, html: string): boolean {
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const code = start?.closest("pre,code");
  if (code && editor.contains(code)) return false;
  const prepared = markdownClipboardHtml(editor.ownerDocument, text, html);
  if (prepared === null) return false;
  const fragment = editor.ownerDocument.createElement("template");
  fragment.innerHTML = prepared;
  const only = fragment.content.firstElementChild;
  // A single paragraph is inline clipboard content; do not introduce a block
  // wrapper when replacing a selection inside an existing paragraph.
  const insertion = fragment.content.childNodes.length === 1 && only?.tagName === "P" ? only.innerHTML : prepared;
  return editor.ownerDocument.execCommand("insertHTML", false, insertion);
}
