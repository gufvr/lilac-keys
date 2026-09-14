import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import { parseHTML } from "linkedom";

import {
  classifyHubSpotPayload,
  findHubSpotEditor,
  htmlToHubSpotPlainText,
  isHubSpotPage,
  measureHubSpotResponsiveness,
  sanitizeHubSpotHtml,
} from "../src/content/editors/hubspotEditor.ts";

function createDocument(): Document {
  return parseHTML("<!doctype html><html><body></body></html>")
    .document as unknown as Document;
}

function htmlWithSize(kilobytes: number): string {
  const target = kilobytes * 1024;
  return `<p>${"x".repeat(Math.max(0, target - 7))}</p>`;
}

test("reconhece somente domínios oficiais do HubSpot", () => {
  assert.equal(isHubSpotPage("app.hubspot.com"), true);
  assert.equal(isHubSpotPage("app-eu1.hubspot.com"), true);
  assert.equal(isHubSpotPage("hubspot.com"), true);
  assert.equal(isHubSpotPage("hubspot.example.com"), false);
  assert.equal(isHubSpotPage("fakehubspot.com"), false);
});

test("localiza editores pelo target, composedPath e activeElement", () => {
  const { document, window } = parseHTML(`
    <html><body>
      <div id="target" contenteditable="true" role="textbox"><span>target</span></div>
      <div id="path" contenteditable="plaintext-only" role="textbox"><span>path</span></div>
      <div id="active" contenteditable="true" role="textbox"><span>active</span></div>
    </body></html>`);
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
    window.HTMLElement as unknown as typeof HTMLElement;

  const target = document.querySelector("#target span")!;
  const path = document.querySelector("#path span")!;
  const active = document.querySelector("#active")!;

  assert.equal(
    findHubSpotEditor({
      eventTarget: target,
      eventPath: [],
      activeElement: active,
      selection: { anchorNode: target.firstChild } as unknown as Selection,
      hostname: "app.hubspot.com",
    })?.id,
    "target",
  );
  assert.equal(
    findHubSpotEditor({
      eventTarget: document.body,
      eventPath: [path],
      activeElement: active,
      selection: { anchorNode: path.firstChild } as unknown as Selection,
      hostname: "app.hubspot.com",
    })?.id,
    "path",
  );
  assert.equal(
    findHubSpotEditor({
      eventTarget: document.body,
      eventPath: [],
      activeElement: active,
      selection: { anchorNode: active.firstChild } as unknown as Selection,
      hostname: "app.hubspot.com",
    })?.id,
    "active",
  );
});

test("rejeita caixas de pesquisa e campos fora da seleção", () => {
  const { document, window } = parseHTML(`
    <html><body>
      <header><div id="search" contenteditable="true" role="searchbox">busca</div></header>
      <div id="editor" contenteditable="true" role="textbox">texto</div>
    </body></html>`);
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
    window.HTMLElement as unknown as typeof HTMLElement;
  const search = document.querySelector("#search")!;
  const editor = document.querySelector("#editor")!;

  assert.equal(
    findHubSpotEditor({
      eventTarget: search,
      eventPath: [],
      activeElement: search,
      selection: { anchorNode: search.firstChild } as unknown as Selection,
      hostname: "app.hubspot.com",
    }),
    null,
  );
  assert.equal(
    findHubSpotEditor({
      eventTarget: editor,
      eventPath: [],
      activeElement: editor,
      selection: { anchorNode: document.body } as unknown as Selection,
      hostname: "app.hubspot.com",
    }),
    null,
  );
});

test("reserva rich para macros pequenas e estruturalmente simples", () => {
  assert.equal(classifyHubSpotPayload("<p>Olá! 😊</p>").strategy, "rich");
  assert.equal(classifyHubSpotPayload(htmlWithSize(5)).strategy, "plain");
  assert.equal(classifyHubSpotPayload(htmlWithSize(25)).strategy, "plain");
  assert.equal(classifyHubSpotPayload(htmlWithSize(50)).strategy, "plain");
  assert.equal(classifyHubSpotPayload(htmlWithSize(100)).strategy, "plain");
});

test("regressão: 4.981 caracteres e cerca de 102 elementos usam texto simples", () => {
  const units = Array.from(
    { length: 51 },
    (_, index) => `<p><strong>Etapa ${index + 1}</strong> ${"x".repeat(65)}</p>`,
  ).join("");
  const html = units.padEnd(4981, "x").slice(0, 4981);
  const plan = classifyHubSpotPayload(html);

  assert.equal(plan.characters, 4981);
  assert.equal(plan.estimatedElements, 102);
  assert.equal(plan.strategy, "plain");
});

test("complexidade estrutural impede rich mesmo em conteúdo curto", () => {
  const nested = `<ul>${"<li><a href=\"https://example.com\">Item</a></li>".repeat(13)}</ul>`;
  const plan = classifyHubSpotPayload(nested);

  assert.equal(plan.strategy, "plain");
  assert.equal(plan.listItems, 13);
  assert.equal(plan.links, 13);
  assert.ok(plan.complexity > 90);
});

test("bloqueia cargas acima do limite de segurança", () => {
  assert.equal(classifyHubSpotPayload(htmlWithSize(129)).strategy, "blocked");
});

test("remove excesso de Word e Gmail preservando a estrutura útil", () => {
  const document = createDocument();
  const html = `
    <div class="gmail_quote" style="font-family: Arial" data-source="gmail">
      <p class="MsoNormal" style="margin: 0" onclick="alert(1)">
        Olá <strong style="color: red">%NOME%</strong>
        <img src="data:image/png;base64,AAAA" alt="imagem" />
        <script>alert(1)</script>
      </p>
      <ul style="padding: 20px"><li class="item">Primeiro</li></ul>
      <a href="https://example.com" target="_blank" style="color: blue">Link</a>
      <a href="javascript:alert(1)">Inválido</a>
    </div>`;

  const sanitized = sanitizeHubSpotHtml(html, document);
  assert.doesNotMatch(sanitized, /style=|class=|onclick=|data-source=/i);
  assert.doesNotMatch(sanitized, /<(img|script)\b/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.match(sanitized, /<strong><span data-lilackeys-placeholder="true">%NOME%<\/span><\/strong>/);
  assert.match(sanitized, /<ul><li>Primeiro<\/li><\/ul>/);
  assert.match(sanitized, /<a href="https:\/\/example.com">Link<\/a>/);
});

test("converte HTML grande em texto preservando parágrafos, listas e links", () => {
  const document = createDocument();
  const text = htmlToHubSpotPlainText(
    "<p>Primeiro</p><p>Segundo</p><ul><li>Item</li></ul><a href=\"https://example.com\">Site</a>",
    document,
  );
  assert.equal(
    text,
    "Primeiro\nSegundo\n- Item\n\nSite (https://example.com)",
  );
});

test("processa 100 KB sem criar uma tarefa longa no sanitizador", (context) => {
  const document = createDocument();
  const unit =
    '<p class="MsoNormal" style="font-family: Arial">Linha de teste</p>';
  const html = unit.repeat(Math.ceil((100 * 1024) / unit.length));
  const startedAt = performance.now();
  const text = htmlToHubSpotPlainText(html, document);
  const durationMs = performance.now() - startedAt;

  assert.match(text, /Linha de teste/);
  assert.ok(durationMs < 2000, `processamento levou ${durationMs.toFixed(1)} ms`);
  context.diagnostic(`100 KB processados em ${durationMs.toFixed(1)} ms`);
});

test("mede responsividade depois de dois frames sem conteúdo da macro", () => {
  const callbacks: FrameRequestCallback[] = [];
  const messages: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => messages.push(args);
  try {
    measureHubSpotResponsiveness(
      classifyHubSpotPayload("<p>Teste</p>"),
      performance.now(),
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    );
    assert.equal(callbacks.length, 1);
    callbacks.shift()!(0);
    assert.equal(callbacks.length, 1);
    callbacks.shift()!(16);
    assert.equal(messages.length, 1);
    assert.doesNotMatch(JSON.stringify(messages), /Teste/);
  } finally {
    console.info = originalInfo;
  }
});
