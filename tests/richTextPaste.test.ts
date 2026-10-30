import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { markdownClipboardHtml } from "../src/utils/richTextPaste.ts";

const example = "Por favor, me envie um **comprovante bancário vinculado ao novo documento**, contendo:\n\n" +
  "- nome do titular\n- banco\n- agência com dígito\n- conta com dígito\n\n" +
  "Pode ser um **print do aplicativo do banco** ou uma **declaração bancária**.";

test("Markdown da regressão vira negrito, lista e parágrafos sem um bloco final vazio", () => {
  const dom = new JSDOM();
  try {
    const html = markdownClipboardHtml(dom.window.document, example + "\n");
    assert.ok(html);
    const output = dom.window.document.createElement("div"); output.innerHTML = html;
    assert.deepEqual(Array.from(output.querySelectorAll("strong")).map(node => node.textContent), [
      "comprovante bancário vinculado ao novo documento", "print do aplicativo do banco", "declaração bancária",
    ]);
    assert.equal(output.querySelectorAll("ul > li").length, 4);
    assert.equal(output.querySelectorAll("p").length, 2);
    assert.equal(output.querySelector("li:nth-child(3)")!.textContent, "agência com dígito");
    assert.ok(html.endsWith("</strong>.</p>"));
    assert.ok(!html.includes("**"));
  } finally { dom.window.close(); }
});

test("HTML realmente formatado mantém a colagem nativa; wrappers com Markdown literal permitem conversão", () => {
  const dom = new JSDOM();
  try {
    for (const html of ["<p><strong>Texto</strong></p>", '<span style="font-weight:700">Texto</span>',
      '<span style="font-style:italic">Texto</span>', '<span style="color:purple">**Texto**</span>',
      '<pre>**Texto**</pre>', '<img src="https://example.test/image.png">']) {
      assert.equal(markdownClipboardHtml(dom.window.document, "**Texto**", html), null);
    }
    assert.equal(markdownClipboardHtml(dom.window.document, "**Texto**", "<p>**Texto**</p>"), "<p><strong>Texto</strong></p>");
    assert.equal(markdownClipboardHtml(dom.window.document, "**Texto**", "<p>Outro conteúdo</p>"), null);
  } finally { dom.window.close(); }
});

test("conteúdo literal, código e placeholders não são tratados como negrito acidentalmente", () => {
  const dom = new JSDOM();
  try {
    for (const text of ["Texto normal", "**sem fechamento", "\\**literal**", "`**código**`", "%**NOME**%", "***triplo***"]) {
      assert.equal(markdownClipboardHtml(dom.window.document, text), null, text);
    }
    const html = markdownClipboardHtml(dom.window.document, "**Título** %__NOME__%\n\n```\n**código**\n```\n\n`**literal**`");
    assert.ok(html);
    assert.ok(html.includes("%__NOME__%"));
    assert.ok(html.includes("<pre><code>**código**</code></pre>"));
    assert.ok(html.includes("<code>**literal**</code>"));
    assert.equal((html.match(/<strong>/g) ?? []).length, 1);
  } finally { dom.window.close(); }
});

test("listas aninhadas e independentes preservam ordem, tipo e start explícito", () => {
  const dom = new JSDOM();
  try {
    const html = markdownClipboardHtml(dom.window.document, "- Pai\n  - Filho\n    1. Neto\n- Irmão\n\n3. Terceiro\n4. Quarto\n\n1. Reinício");
    assert.ok(html);
    const output = dom.window.document.createElement("div"); output.innerHTML = html;
    assert.equal(output.children.length, 3);
    assert.equal(output.querySelector("ul > li > ul > li > ol > li")!.textContent, "Neto");
    assert.equal(output.children[1].getAttribute("start"), "3");
    assert.equal(output.children[2].getAttribute("start"), null);
    assert.ok(!Array.from(output.querySelectorAll("li")).some(item => !item.textContent?.trim()));
  } finally { dom.window.close(); }
});

test("HTML literal do texto é escapado sem criar atributos ou elementos executáveis", () => {
  const dom = new JSDOM();
  try {
    const html = markdownClipboardHtml(dom.window.document, '<script>alert(1)</script> **forte**\n\n- <img src=x onerror=alert(1)> %NOME% 🫡');
    assert.ok(html);
    const output = dom.window.document.createElement("div"); output.innerHTML = html;
    assert.equal(output.querySelectorAll("script,img,[onerror]").length, 0);
    assert.ok(output.textContent?.includes("<script>alert(1)</script>"));
    assert.ok(output.textContent?.includes("%NOME% 🫡"));
    assert.equal(output.querySelector("strong")!.textContent, "forte");
  } finally { dom.window.close(); }
});
