import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { automaticListContext, pasteLinkOverSelection, serializeRichText, validEditorLink } from "../src/utils/richTextEditing.ts";

function editor(html: string, target = "p", offset?: number, end?: number) {
  const dom = new JSDOM(`<div id="editor" contenteditable="true">${html}</div>`);
  const root = dom.window.document.getElementById("editor")!;
  const block = target === "#editor" ? root : root.querySelector(target)!;
  const range = dom.window.document.createRange();
  if (offset === undefined) { range.selectNodeContents(block); range.collapse(false); }
  else { range.setStart(block.firstChild!, offset); range.setEnd(block.firstChild!, end ?? offset); }
  dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
  return { dom, root };
}
const space = { inputType: "insertText", data: " ", isComposing: false, cancelable: true };

test("identifica somente os marcadores no início do bloco e preserva a seleção original", () => {
  for (const [html, target, offset, kind] of [
    ["<p>-</p>", "p", 1, "ul"],
    ["<p>1.</p>", "p", 2, "ol"],
    ["<p><strong>-restante</strong></p>", "strong", 1, "ul"],
    ["-", "#editor", 1, "ul"],
  ] as const) {
    const ui = editor(html, target, offset);
    try {
      assert.equal(automaticListContext(ui.root, space)?.kind, kind);
      assert.equal(ui.root.innerHTML, html);
      assert.equal(ui.dom.window.getSelection()!.anchorOffset, offset);
    } finally { ui.dom.window.close(); }
  }
});

test("não converte texto literal, seleção não colapsada ou marcadores após uma quebra", () => {
  for (const html of ["<p>2.</p>", "<p>Texto -</p>", "<p> -</p>", "<p>Antes<br>-</p>", "<p><img src='test'>-</p>"]) {
    const ui = editor(html);
    try { assert.equal(automaticListContext(ui.root, space), null); } finally { ui.dom.window.close(); }
  }
  const ui = editor("<p>-</p>", "p", 0, 1);
  try { assert.equal(automaticListContext(ui.root, space), null); } finally { ui.dom.window.close(); }
});

test("links, código, blockquote, listas e regiões não editáveis são excluídos", () => {
  for (const html of [
    '<p><a href="https://example.test">-</a></p>', "<p><code>-</code></p>",
    "<pre><p>-</p></pre>", "<blockquote><p>-</p></blockquote>",
    "<ul><li><p>-</p></li></ul>", "<ol><li><p>-</p></li></ol>",
    '<p><span contenteditable="false">-</span></p>',
  ]) {
    const ui = editor(html, html.includes("<a ") ? "a" : html.includes("<code>") ? "code" : html.includes("<span ") ? "span" : "p");
    try { assert.equal(automaticListContext(ui.root, space), null); } finally { ui.dom.window.close(); }
  }
});

test("IME, colagem, repetição de texto e eventos não canceláveis não acionam a conversão", () => {
  const ui = editor("<p>-</p>");
  try {
    for (const event of [
      { ...space, isComposing: true }, { ...space, inputType: "insertFromPaste" },
      { ...space, inputType: "insertCompositionText" }, { ...space, cancelable: false },
      { ...space, data: "- colado" }, { ...space, data: "  " },
    ]) assert.equal(automaticListContext(ui.root, event), null);
  } finally { ui.dom.window.close(); }
});

test("serialização omite apenas o bloco de rascunho vazio sem modificar o DOM de edição", () => {
  const html = '<p>Antes</p><p><br></p><ul><li><strong>%NOME%</strong> 🫡</li></ul><div><br></div>';
  const ui = editor(html);
  try {
    const draft = ui.root.lastElementChild as HTMLElement;
    assert.equal(serializeRichText(ui.root, draft), html.replace("<div><br></div>", ""));
    assert.equal(ui.root.innerHTML, html);
    assert.equal(serializeRichText(ui.root, null), html);
    draft.textContent = "Depois";
    assert.ok(serializeRichText(ui.root, draft).endsWith("<div>Depois</div>"));
  } finally { ui.dom.window.close(); }
});

test("somente o item vazio recém-criado é omitido, preservando sublistas, imagens e quebras deliberadas", () => {
  const ui = editor('<p>Texto</p><ul><li>A<ul><li>B</li></ul></li><li><br></li></ul><p><br></p>');
  try {
    const draft = ui.root.querySelector(":scope > ul > li:last-child") as HTMLElement;
    assert.equal(serializeRichText(ui.root, draft), '<p>Texto</p><ul><li>A<ul><li>B</li></ul></li></ul><p><br></p>');
    const image = ui.dom.window.document.createElement("img"); image.src = "https://example.test/image.png";
    draft.append(image);
    assert.ok(serializeRichText(ui.root, draft).includes("image.png"));
    draft.replaceChildren(ui.dom.window.document.createTextNode(" "));
    assert.ok(serializeRichText(ui.root, draft).includes("<li> </li>"));
  } finally { ui.dom.window.close(); }
});

test("URLs HTTPS, mailto e tel são aceitas sem reescrever o endereço informado", () => {
  for (const url of ["https://example.test/?x=1&y=2", "https://example.test/ação", "mailto:test@example.test?subject=Olá", "tel:+5511999999999"]) {
    assert.equal(validEditorLink(` ${url} `), url);
  }
});

test("esquemas inseguros, endereços vazios e caracteres de controle são rejeitados", () => {
  for (const url of ["", "javascript:alert(1)", "data:text/html,test", "file:///test", "blob:https://example.test/id", "http://example.test", "mailto:", "tel:", "www.example.test", "https://", "java\nscript:alert(1)", "https://example.test/\u0000"]) {
    assert.equal(validEditorLink(url), null, JSON.stringify(url));
  }
});

test("colagem de URL exige texto selecionado no editor e mantém os demais casos para a colagem normal", () => {
  for (const [html, start, end, clipboard] of [
    ["<p>link</p>", 4, 4, "https://example.test"],
    ["<p>link</p>", 0, 4, "texto comum"],
    ["<p>link</p>", 0, 4, "https://example.test texto"],
    ["<p>link</p>", 0, 4, "https://one.test\nhttps://two.test"],
    ["<p>link</p>", 0, 4, "javascript:alert(1)"],
    ["<p> </p>", 0, 1, "https://example.test"],
  ] as const) {
    const ui = editor(html, "p", start, end);
    try {
      Object.defineProperty(ui.dom.window.document, "execCommand", { value: () => { throw new Error("Unexpected link mutation"); } });
      assert.equal(pasteLinkOverSelection(ui.root, clipboard), false);
      assert.equal(ui.root.innerHTML, html);
    } finally { ui.dom.window.close(); }
  }
  const ui = editor("<p>link</p>");
  try {
    const outside = ui.dom.window.document.createElement("div"); outside.textContent = "outro";
    ui.dom.window.document.body.append(outside);
    const range = ui.dom.window.document.createRange(); range.selectNodeContents(outside);
    ui.dom.window.getSelection()!.removeAllRanges(); ui.dom.window.getSelection()!.addRange(range);
    assert.equal(pasteLinkOverSelection(ui.root, "https://example.test"), false);
  } finally { ui.dom.window.close(); }
});
