import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import { parseHTML } from "linkedom";
import {
  normalizeHttpsImageUrl,
  stripUnsupportedMacroImages,
} from "../src/utils/macroImages.ts";
import {
  classifyMacroImageSource,
  MAX_EMBEDDED_IMAGE_BYTES,
} from "../src/content/hubspotImages.ts";

import {
  classifyHubSpotPayload,
  ensureHubSpotSelectionOutsideList,
  findHubSpotEditor,
  handleHubSpotPlaceholderTab,
  htmlToHubSpotPlainText,
  insertStructuredBatches,
  isHubSpotPage,
  isRemirrorEditor,
  shouldUseNativeHubSpotHtmlInsert,
  moveToNextHubSpotPlaceholder,
  prepareHubSpotHtml,
  runExclusiveHubSpotExpansion,
  sanitizeHubSpotHtml,
  selectFirstHubSpotPlaceholder,
  shouldInsertHubSpotAtomically,
} from "../src/content/editors/hubspotEditor.ts";

function createDocument(): Document {
  return parseHTML("<!doctype html><html><body></body></html>")
    .document as unknown as Document;
}

function createTestBoundary() {
  let present = true;
  let stable = true;
  let placeCalls = 0;
  let finishCalls = 0;
  let cleanupCalls = 0;
  return {
    boundary: {
      isPresent: () => present,
      isCaretStable: () => present && stable,
      placeCaret: () => {
        placeCalls += 1;
        if (!present) return false;
        stable = true;
        return true;
      },
      finish: () => {
        finishCalls += 1;
        if (!present) return false;
        present = false;
        return true;
      },
      cleanup: () => {
        cleanupCalls += 1;
        present = false;
      },
    },
    destabilize: () => {
      stable = false;
    },
    remove: () => {
      present = false;
    },
    stats: () => ({ placeCalls, finishCalls, cleanupCalls }),
  };
}

function htmlWithSize(kilobytes: number): string {
  const target = kilobytes * 1024;
  return `<p>${"x".repeat(Math.max(0, target - 7))}</p>`;
}

test("reconhece somente domínios oficiais do HubSpot", () => {
  assert.equal(isHubSpotPage("app.hubspot.com"), true);
  assert.equal(isHubSpotPage("app-eu1.hubspot.com"), true);
  assert.equal(isHubSpotPage("static.hsappstatic.net"), true);
  assert.equal(isHubSpotPage("app.hsappstatic.net"), true);
  assert.equal(isHubSpotPage("hubspot.com"), true);
  assert.equal(
    isHubSpotPage("", ["https://app.hubspot.com/help-desk/123"]),
    true,
  );
  assert.equal(
    isHubSpotPage("", ["https://example.com/embed"]),
    false,
  );
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

test("localiza estruturas atuais com contenteditable vazio e editores semânticos", () => {
  const { document, window } = parseHTML(`
    <html><body>
      <div id="empty" contenteditable=""><span>vazio</span></div>
      <div id="slate" data-slate-editor="true"><span>slate</span></div>
      <div id="lexical" data-lexical-editor="true"><span>lexical</span></div>
      <div id="prosemirror" class="ProseMirror"><span>prosemirror</span></div>
      <div id="textbox" role="textbox" aria-multiline="true"><span>textbox</span></div>
    </body></html>`);
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
    window.HTMLElement as unknown as typeof HTMLElement;

  for (const id of ["empty", "slate", "lexical", "prosemirror", "textbox"]) {
    const editor = document.querySelector(`#${id}`)!;
    const inner = editor.querySelector("span")!;
    assert.equal(
      findHubSpotEditor({
        eventTarget: inner,
        eventPath: [inner, editor],
        activeElement: editor,
        selection: {
          anchorNode: inner.firstChild,
          focusNode: inner.firstChild,
        } as unknown as Selection,
        hostname: "app.hubspot.com",
      })?.id,
      id,
    );
  }
});

test("reserva inserção nativa para editores legados e rich", () => {
  const { document, window } = parseHTML(`
    <html><body>
      <div id="remirror" class="remirror-editor ProseMirror" contenteditable="true"></div>
      <div id="legacy" contenteditable="true"></div>
    </body></html>`);
  (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
    window.HTMLElement as unknown as typeof HTMLElement;
  const remirror = document.querySelector("#remirror") as unknown as HTMLElement;
  const legacy = document.querySelector("#legacy") as unknown as HTMLElement;

  assert.equal(isRemirrorEditor(remirror), true);
  assert.equal(shouldInsertHubSpotAtomically(remirror, "structured"), false);
  assert.equal(shouldInsertHubSpotAtomically(remirror, "rich"), false);
  assert.equal(shouldInsertHubSpotAtomically(legacy, "structured"), false);
  assert.equal(shouldInsertHubSpotAtomically(legacy, "rich"), true);
});

test("usa a inserção HTML nativa para macros moderadas no Remirror atual", () => {
  const document = createDocument();
  const editor = document.createElement("div");
  editor.className = "ProseMirror";
  document.body.append(editor);
  try {
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => true });
    assert.equal(shouldUseNativeHubSpotHtmlInsert(editor, "<p>Olá</p><p>Até mais</p>"), true);
    assert.equal(
      shouldUseNativeHubSpotHtmlInsert(
        editor,
        "<ol><li>Primeiro</li><li>Segundo<ul><li>Aninhado</li></ul></li></ol>".repeat(15),
      ),
      true,
    );
    assert.equal(
      shouldUseNativeHubSpotHtmlInsert(
        editor,
        `<p>Exemplo do documento:</p><p><img src="data:image/png;base64,${"A".repeat(150 * 1024)}" alt="Documento"></p><p>Envie por aqui.</p>`,
      ),
      true,
    );
    assert.equal(shouldUseNativeHubSpotHtmlInsert(editor, "<p>" + "x".repeat(17 * 1024) + "</p>"), false);
  } finally {
    editor.remove();
  }
});

test("resolve o host completo quando target e foco herdam isContentEditable", () => {
  const { document } = parseHTML(`
    <html><body><div id="editor" class="ProseMirror" contenteditable="true">
      <p><strong><span id="inner">texto</span></strong></p>
    </div></body></html>`);
  const editor = document.querySelector("#editor")!;
  const inner = document.querySelector("#inner")!;
  for (const element of [inner, inner.parentElement!, inner.parentElement!.parentElement!]) {
    Object.defineProperty(element, "isContentEditable", { value: true });
  }
  const selection = {
    anchorNode: inner.firstChild,
    focusNode: inner.firstChild,
  } as unknown as Selection;

  for (const lookup of [
    { eventTarget: inner, eventPath: [], activeElement: editor },
    { eventTarget: inner.firstChild, eventPath: [], activeElement: editor },
    { eventTarget: document.body, eventPath: [inner, editor], activeElement: document.body },
    { eventTarget: document.body, eventPath: [], activeElement: inner },
  ]) {
    assert.equal(
      findHubSpotEditor({ ...lookup, selection, hostname: "app.hubspot.com" }),
      editor,
    );
  }
});

test("rejeita subárvores não editáveis mesmo com host no path ou activeElement", () => {
  const { document } = parseHTML(`
    <html><body><div id="editor" class="ProseMirror" contenteditable="true">
      <p id="editable">texto</p>
      <span contenteditable="false"><span id="locked">protegido</span></span>
    </div></body></html>`);
  const editor = document.querySelector("#editor")!;
  const locked = document.querySelector("#locked")!;
  const editable = document.querySelector("#editable")!;

  for (const [anchorNode, focusNode] of [
    [locked.firstChild, locked.firstChild],
    [editable.firstChild, locked.firstChild],
    [locked.firstChild, editable.firstChild],
  ]) {
    assert.equal(
      findHubSpotEditor({
        eventTarget: locked,
        eventPath: [locked, locked.parentElement!, editor],
        activeElement: editor,
        selection: { anchorNode, focusNode } as unknown as Selection,
        hostname: "app.hubspot.com",
      }),
      null,
    );
  }
});

test("respeita editores aninhados independentes e seus limites de seleção", () => {
  const { document } = parseHTML(`
    <html><body><div id="outer" contenteditable="true">
      <p id="outside">anterior</p>
      <div contenteditable="false"><div id="inner" class="ProseMirror" contenteditable="true">
        <p><span id="value">interno</span></p>
      </div></div>
    </div></body></html>`);
  const outer = document.querySelector("#outer")!;
  const inner = document.querySelector("#inner")!;
  const value = document.querySelector("#value")!;
  Object.defineProperty(value, "isContentEditable", { value: true });

  assert.equal(
    findHubSpotEditor({
      eventTarget: outer,
      eventPath: [outer, value, inner],
      activeElement: outer,
      selection: { anchorNode: value.firstChild, focusNode: value.firstChild } as unknown as Selection,
      hostname: "app.hubspot.com",
    }),
    inner,
  );
  assert.equal(
    findHubSpotEditor({
      eventTarget: value,
      eventPath: [value, inner, outer],
      activeElement: inner,
      selection: {
        anchorNode: value.firstChild,
        focusNode: document.querySelector("#outside")!.firstChild,
      } as unknown as Selection,
      hostname: "app.hubspot.com",
    }),
    null,
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

test("reserva rich para macros pequenas e usa structured nas maiores", () => {
  assert.equal(classifyHubSpotPayload("<p>Olá! 😊</p>").strategy, "rich");
  assert.equal(classifyHubSpotPayload(htmlWithSize(5)).strategy, "structured");
  assert.equal(classifyHubSpotPayload(htmlWithSize(25)).strategy, "structured");
  assert.equal(classifyHubSpotPayload(htmlWithSize(50)).strategy, "structured");
  assert.equal(classifyHubSpotPayload(htmlWithSize(100)).strategy, "structured");
});

test("regressão: 4.981 caracteres e cerca de 102 elementos usam lotes estruturados", () => {
  const units = Array.from(
    { length: 51 },
    (_, index) => `<p><strong>Etapa ${index + 1}</strong> ${"x".repeat(65)}</p>`,
  ).join("");
  const html = units.padEnd(4981, "x").slice(0, 4981);
  const plan = classifyHubSpotPayload(html);

  assert.equal(plan.characters, 4981);
  assert.equal(plan.estimatedElements, 102);
  assert.equal(plan.strategy, "structured");
});

test("complexidade estrutural impede rich mesmo em conteúdo curto", () => {
  const nested = `<ul>${"<li><a href=\"https://example.com\">Item</a></li>".repeat(13)}</ul>`;
  const plan = classifyHubSpotPayload(nested);

  assert.equal(plan.strategy, "structured");
  assert.equal(plan.listItems, 13);
  assert.equal(plan.links, 13);
  assert.ok(plan.complexity > 90);
});

test("bloqueia cargas acima do limite de segurança", () => {
  assert.equal(classifyHubSpotPayload(htmlWithSize(128)).strategy, "structured");
  assert.equal(classifyHubSpotPayload(htmlWithSize(129)).strategy, "blocked");
  assert.equal(
    classifyHubSpotPayload("<p>x</p>".repeat(1001)).strategy,
    "blocked",
  );
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
  assert.match(sanitized, /<img\b[^>]*data:image\/png;base64,AAAA/i);
  assert.doesNotMatch(sanitized, /<script\b/i);
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

test("prepara lotes estruturados de 5, 25, 50 e 100 KB", (context) => {
  const document = createDocument();
  for (const kilobytes of [5, 25, 50, 100]) {
    const unit = `<p><strong>Etapa</strong> ${"x".repeat(900)} 😊</p>`;
    const html = unit.repeat(Math.ceil((kilobytes * 1024) / unit.length));
    const startedAt = performance.now();
    const prepared = prepareHubSpotHtml(html, document);
    const durationMs = performance.now() - startedAt;

    assert.ok(prepared.batches.length > 0);
    assert.ok(prepared.batches.length <= 100);
    assert.ok(prepared.batches.every((batch) => batch.length <= 8 * 1024));
    assert.ok(durationMs < 2000, `${kilobytes} KB levou ${durationMs.toFixed(1)} ms`);
    context.diagnostic(
      `${kilobytes} KB: ${prepared.batches.length} lotes em ${durationMs.toFixed(1)} ms`,
    );
  }
});

test("preserva HTML semântico e imagens HTTPS ou incorporadas seguras", () => {
  const document = createDocument();
  const html = `
    <p class="MsoNormal"><strong>Negrito</strong> <em>Itálico</em> <u>Sublinhado</u> <s>Riscado</s></p>
    <ol start="3"><li>Primeiro<ul><li>Interno</li></ul></li><li>Segundo</li></ol>
    <a href="mailto:teste@example.com" target="_blank">E-mail</a>
    <img src="https://cdn.example.com/a.png" alt="Produto" width="2000" height="500" class="imagem" />
    <img src="data:image/png;base64,AAAA" alt="Incorporada" />
    <img src="blob:https://app.hubspot.com/id" alt="Temporária" />`;
  const prepared = prepareHubSpotHtml(html, document);

  assert.match(prepared.html, /<strong>Negrito<\/strong>/);
  assert.match(prepared.html, /<em>Itálico<\/em>/);
  assert.match(prepared.html, /<u>Sublinhado<\/u>/);
  assert.match(prepared.html, /<s>Riscado<\/s>/);
  assert.match(prepared.html, /<ol start="3"><li>Primeiro<ul><li>Interno<\/li><\/ul><\/li>/);
  assert.match(prepared.html, /href="mailto:teste@example.com"/);
  assert.match(prepared.html, /<img\b[^>]*src="https:\/\/cdn\.example\.com\/a\.png"/);
  assert.match(prepared.html, /<img\b[^>]*alt="Produto"/);
  assert.match(prepared.html, /<img\b[^>]*width="1600"/);
  assert.match(prepared.html, /<img\b[^>]*height="500"/);
  assert.match(prepared.html, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(prepared.html, /class=|target=|blob:/);
  assert.equal(prepared.acceptedImages, 2);
  assert.equal(prepared.rejectedImages, 1);
});

test("preserva até doze imagens HTTPS e remove pixels de rastreamento", () => {
  const document = createDocument();
  const images = [
    '<img src="https://cdn.example.com/track.gif" alt="Track" width="1" height="1">',
    ...Array.from(
      { length: 4 },
      (_, index) => `<img src="https://cdn.example.com/${index}.png" alt="Imagem ${index}">`,
    ),
  ].join("");
  const prepared = prepareHubSpotHtml(images, document);

  assert.equal(prepared.acceptedImages, 4);
  assert.equal(prepared.rejectedImages, 1);
  assert.equal((prepared.html.match(/<img\b/g) ?? []).length, 4);
  assert.match(prepared.html, /\[Imagem: Track\]/);
});

test("mantém imagens incorporadas seguras e remove blob ou HTTP", () => {
  const html =
    '<p>Antes</p><img src="data:image/png;base64,AAAA" alt="Local">' +
    '<img src="blob:https://app.hubspot.com/id" alt="Blob">' +
    '<img src="http://example.com/insegura.png" alt="HTTP">' +
    '<img src="https://cdn.example.com/segura.png" alt="HTTPS"><p>Depois</p>';
  const sanitized = stripUnsupportedMacroImages(html);

  assert.equal(sanitized.removedImages, 2);
  assert.match(sanitized.html, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(sanitized.html, /blob:|http:\/\//);
  assert.match(sanitized.html, /https:\/\/cdn\.example\.com\/segura\.png/);
  assert.match(sanitized.html, /^<p>Antes<\/p>/);
  assert.match(sanitized.html, /<p>Depois<\/p>$/);
});

test("aceita somente URL HTTPS válida para novas imagens", () => {
  assert.equal(
    normalizeHttpsImageUrl("https://cdn.example.com/imagem.png"),
    "https://cdn.example.com/imagem.png",
  );
  assert.equal(normalizeHttpsImageUrl("http://example.com/imagem.png"), null);
  assert.equal(normalizeHttpsImageUrl("data:image/png;base64,AAAA"), null);
  assert.equal(normalizeHttpsImageUrl("blob:https://example.com/id"), null);
  assert.equal(normalizeHttpsImageUrl("não é uma URL"), null);
});

test("aceita imagem incorporada segura e rejeita payload excessivo", () => {
  assert.deepEqual(classifyMacroImageSource("data:image/png;base64,AAAA"), {
    kind: "embedded",
    source: "data:image/png;base64,AAAA",
    bytes: 3,
  });
  const oversized = `data:image/png;base64,${"A".repeat(
    Math.ceil((MAX_EMBEDDED_IMAGE_BYTES * 4) / 3) + 8,
  )}`;
  assert.equal(classifyMacroImageSource(oversized), null);
});

test("mantém imagem incorporada como lote semântico completo", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const dataUrl = `data:image/png;base64,${"A".repeat(150 * 1024)}`;
  const prepared = prepareHubSpotHtml(
    `<p>Antes</p><img src="${dataUrl}" alt="Local"><p>Depois</p>`,
    document,
  );
  const inserted: string[] = [];
  const boundary = createTestBoundary();
  const result = await insertStructuredBatches(editor, prepared.batches, {
    insertHtml: (_editor, html) => {
      inserted.push(html);
      return true;
    },
    createBoundary: () => boundary.boundary,
    ensureOutsideList: () => true,
    selectionBelongs: () => true,
    yieldFrame: async () => undefined,
  });

  assert.equal(result.inserted, true);
  assert.equal(inserted.length, 3);
  assert.match(inserted[1], /^<img\b[^>]*data:image\/png;base64/);
  assert.match(inserted[1], /alt="Local"/);
});

test("divide listas ordenadas entre itens mantendo a numeração", () => {
  const document = createDocument();
  const html = `<ol start="5">${Array.from(
    { length: 70 },
    (_, index) => `<li><strong>Item ${index + 1}</strong></li>`,
  ).join("")}</ol>`;
  const prepared = prepareHubSpotHtml(html, document);

  assert.ok(prepared.batches.length >= 3);
  assert.match(prepared.batches[0], /^<ol start="5">/);
  assert.match(prepared.batches[1], /<ol start="/);
  assert.equal(
    prepared.batches.reduce(
      (total, batch) => total + (batch.match(/<li>/g) ?? []).length,
      0,
    ),
    70,
  );
  assert.equal(
    prepared.batches.reduce(
      (total, batch) => total + (batch.match(/<strong>/g) ?? []).length,
      0,
    ),
    70,
  );
});

test("isola listas e preserva a ordem e a hierarquia da macro de regressão", () => {
  const document = createDocument();
  const html = [
    "<p>Seguiremos por estas etapas:</p>",
    "<ol><li><strong>Validação</strong></li><li>Saque</li><li>Conclusão</li></ol>",
    "<p>Para começar, preencha o termo.</p>",
    '<p><a href="https://example.com/termo">Baixar termo</a></p>',
    "<p><strong>CEDENTE:</strong></p>",
    "<ul><li>Documento com foto</li><li>CPF e selfie</li></ul>",
    "<p><em>CESSIONÁRIO:</em></p>",
    "<ul><li>Documento jurídico<ul><li>Contrato Social</li><li>Certificado</li></ul></li><li>Endereço</li></ul>",
    "<ol><li>Enviar documentos</li><li>Aguardar validação</li></ol>",
    "<p>Depois do envio, avise aqui. &#x1F60A;</p>",
    `<p>${"x".repeat(5000)}</p>`,
  ].join("");
  const prepared = prepareHubSpotHtml(html, document);
  const listBatches = prepared.batches.filter((batch) => /<(?:ol|ul)\b/.test(batch));

  assert.equal(listBatches.length, 4);
  assert.ok(listBatches.every((batch) => !/<p\b/.test(batch)));
  assert.match(listBatches[0], /^<ol>/);
  assert.match(listBatches[1], /^<ul>/);
  assert.match(listBatches[2], /^<ul>/);
  assert.match(listBatches[3], /^<ol>/);
  assert.doesNotMatch(listBatches[0], /start=/);
  assert.doesNotMatch(listBatches[3], /start=/);

  const reconstructed = document.createElement("div");
  reconstructed.innerHTML = prepared.batches.join("");
  const topLevel = Array.from(reconstructed.children);
  assert.deepEqual(
    topLevel.slice(0, 10).map((element) => element.tagName),
    ["P", "OL", "P", "P", "P", "UL", "P", "UL", "OL", "P"],
  );
  assert.deepEqual(
    Array.from(topLevel[1].children).map((item) => item.textContent),
    ["Validação", "Saque", "Conclusão"],
  );
  assert.equal(reconstructed.querySelectorAll("li:empty").length, 0);
  assert.equal(reconstructed.querySelectorAll("li > p").length, 0);
  assert.equal(topLevel[9].textContent, "Depois do envio, avise aqui. 😊");
});

test("mantém ul e ol independentes quando aparecem em sequência", () => {
  const document = createDocument();
  const prepared = prepareHubSpotHtml(
    "<ul><li>Bullet</li></ul><ol><li>Número</li></ol>" +
      `<ul><li>Outro bullet</li></ul><p>${"x".repeat(5000)}</p>`,
    document,
  );

  assert.deepEqual(prepared.batches.slice(0, 3), [
    "<ul><li>Bullet</li></ul>",
    "<ol><li>Número</li></ol>",
    "<ul><li>Outro bullet</li></ul>",
  ]);
});

test("insere HTML structured compacto como uma árvore única", () => {
  const document = createDocument();
  const html =
    "<p>Etapas:</p>" +
    `<ol>${Array.from({ length: 20 }, (_, index) => `<li>Item ${index + 1}</li>`).join("")}</ol>` +
    "<p>Documentos:</p>" +
    `<ul>${Array.from({ length: 10 }, (_, index) => `<li>Documento ${index + 1}</li>`).join("")}</ul>` +
    "<p>Conteúdo posterior à lista.</p>";
  const plan = classifyHubSpotPayload(html);
  const prepared = prepareHubSpotHtml(html, document);

  assert.equal(plan.strategy, "structured");
  assert.ok(plan.estimatedElements > 30);
  assert.equal(prepared.batches.length, 1);
  assert.equal(prepared.batches[0], prepared.html);
});

test("não converte Markdown literal sem evidência do formato armazenado", () => {
  const document = createDocument();
  const markdown = "**Negrito** e [Link](https://example.com)";
  const prepared = prepareHubSpotHtml(markdown, document);

  assert.equal(prepared.html, `<p>${markdown}</p>`);
  assert.doesNotMatch(prepared.html, /<(?:strong|a)\b/);
});

test("divide parágrafo grande preservando formatação inline", () => {
  const document = createDocument();
  const prepared = prepareHubSpotHtml(
    `<p><strong>${"á😊".repeat(6000)}</strong></p>`,
    document,
  );

  assert.ok(prepared.batches.length > 1);
  assert.ok(prepared.batches.every((batch) => batch.length <= 8 * 1024));
  assert.ok(prepared.batches.every((batch) => batch.startsWith("<p><strong>")));
  assert.ok(prepared.batches.every((batch) => batch.endsWith("</strong></p>")));
  const restored = prepared.batches
    .map((batch) => {
      const batchDocument = createDocument();
      const container = batchDocument.createElement("div");
      container.innerHTML = batch;
      return container.textContent;
    })
    .join("");
  assert.equal(restored, "á😊".repeat(6000));
  assert.doesNotMatch(restored, /�/);
});

test("considera expansão de entidades HTML no limite do lote", () => {
  const document = createDocument();
  const prepared = prepareHubSpotHtml(`<p>${"&".repeat(5000)}</p>`, document);

  assert.ok(prepared.batches.length > 1);
  assert.ok(prepared.batches.every((batch) => batch.length <= 8 * 1024));
});

test("seleciona o primeiro placeholder depois da expansão", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML = prepareHubSpotHtml(
    "<p>Olá, %NOME%.</p><p>Protocolo: %PROTOCOLO%</p>",
    document,
  ).html;
  let selectedNode: Node | null = null;
  let removedRanges = 0;
  let addedRanges = 0;
  const range = {
    selectNodeContents: (node: Node) => {
      selectedNode = node;
    },
  } as unknown as Range;
  const selection = {
    removeAllRanges: () => {
      removedRanges += 1;
    },
    addRange: (addedRange: Range) => {
      assert.equal(addedRange, range);
      addedRanges += 1;
    },
  } as unknown as Selection;

  assert.equal(
    selectFirstHubSpotPlaceholder(editor, {
      getSelection: () => selection,
      createRange: () => range,
    }),
    true,
  );
  assert.equal((selectedNode as Node | null)?.textContent, "%NOME%");
  assert.equal(removedRanges, 1);
  assert.equal(addedRanges, 1);
});

test("mantém placeholders em macros estruturadas divididas em lotes", () => {
  const document = createDocument();
  const html = Array.from(
    { length: 80 },
    (_, index) => `<p>Campo ${index + 1}: %VALOR_${index + 1}%</p>`,
  ).join("");
  const prepared = prepareHubSpotHtml(html, document);

  assert.ok(prepared.batches.length > 1);
  assert.equal(
    prepared.batches.reduce(
      (total, batch) =>
        total + (batch.match(/data-lilackeys-placeholder="true"/g) ?? []).length,
      0,
    ),
    80,
  );
});

test("mantém o cursor final quando a macro não possui placeholder", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML = "<p>Macro sem campos</p>";
  let selectionRequested = false;

  assert.equal(
    selectFirstHubSpotPlaceholder(editor, {
      getSelection: () => {
        selectionRequested = true;
        return null;
      },
    }),
    false,
  );
  assert.equal(selectionRequested, false);
});

test("Tab avança para o próximo marcador após substituir o primeiro", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML =
    '<p>Olá, <span data-lilackeys-placeholder="true">Gustavo</span>. ' +
    'Protocolo: <span data-lilackeys-placeholder="true">%PROTOCOLO%</span>.</p>';
  const firstValue = editor.querySelector("span")!.firstChild!;
  let selectedNode: Node | null = null;
  const range = {
    selectNodeContents: (node: Node) => {
      selectedNode = node;
    },
  } as unknown as Range;
  const selection = {
    anchorNode: firstValue,
    anchorOffset: firstValue.textContent?.length ?? 0,
    removeAllRanges: () => undefined,
    addRange: () => undefined,
  } as unknown as Selection;

  assert.equal(
    moveToNextHubSpotPlaceholder(editor, selection, {
      createRange: () => range,
    }),
    true,
  );
  assert.equal((selectedNode as Node | null)?.textContent, "%PROTOCOLO%");
});

test("Tab encontra texto %...% quando o HubSpot remove os marcadores", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML =
    "<p>Olá, Gustavo. Seu protocolo é <strong>%PROTOCOLO%</strong>.</p>";
  const currentText = editor.querySelector("p")!.firstChild!;
  const protocolText = editor.querySelector("strong")!.firstChild!;
  let rangeStart: [Node, number] | null = null;
  let rangeEnd: [Node, number] | null = null;
  const range = {
    setStart: (node: Node, offset: number) => {
      rangeStart = [node, offset];
    },
    setEnd: (node: Node, offset: number) => {
      rangeEnd = [node, offset];
    },
  } as unknown as Range;
  const selection = {
    anchorNode: currentText,
    anchorOffset: currentText.textContent?.length ?? 0,
    removeAllRanges: () => undefined,
    addRange: () => undefined,
  } as unknown as Selection;

  assert.equal(
    moveToNextHubSpotPlaceholder(editor, selection, {
      createRange: () => range,
    }),
    true,
  );
  assert.deepEqual(rangeStart, [protocolText, 0]);
  assert.deepEqual(rangeEnd, [protocolText, "%PROTOCOLO%".length]);
});

test("Tab usa somente placeholders posteriores ao cursor", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML =
    "<p>%ANTERIOR%</p><p>Preenchido</p><ul><li><em>%SEGUINTE%</em></li></ul>";
  const currentText = editor.querySelectorAll("p")[1].firstChild!;
  const nextText = editor.querySelector("em")!.firstChild!;
  let selectedStart: [Node, number] | null = null;
  const range = {
    setStart: (node: Node, offset: number) => {
      selectedStart = [node, offset];
    },
    setEnd: () => undefined,
  } as unknown as Range;
  const selection = {
    anchorNode: currentText,
    anchorOffset: currentText.textContent?.length ?? 0,
    removeAllRanges: () => undefined,
    addRange: () => undefined,
  } as unknown as Selection;

  assert.equal(
    moveToNextHubSpotPlaceholder(editor, selection, {
      createRange: () => range,
    }),
    true,
  );
  assert.deepEqual(selectedStart, [nextText, 0]);
});

test("só bloqueia o Tab quando a navegação acontece", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML = "<p>Texto final</p>";
  const text = editor.querySelector("p")!.firstChild!;
  const selection = {
    anchorNode: text,
    anchorOffset: text.textContent?.length ?? 0,
    removeAllRanges: () => undefined,
    addRange: () => undefined,
  } as unknown as Selection;
  let prevented = 0;
  let stopped = 0;
  const event = {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => {
      prevented += 1;
    },
    stopPropagation: () => {
      stopped += 1;
    },
  };

  assert.equal(handleHubSpotPlaceholderTab(event, editor, selection), false);
  assert.equal(prevented, 0);
  assert.equal(stopped, 0);
  assert.equal(
    handleHubSpotPlaceholderTab({ ...event, shiftKey: true }, editor, selection),
    false,
  );
  assert.equal(prevented, 0);
  assert.equal(stopped, 0);
});

test("bloqueia o evento quando o Tab seleciona o próximo campo", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML =
    '<p><span data-lilackeys-placeholder="true">Preenchido</span></p>' +
    '<p><span data-lilackeys-placeholder="true">%PROXIMO%</span></p>';
  const current = editor.querySelector("span")!.firstChild!;
  const selection = {
    anchorNode: current,
    anchorOffset: current.textContent?.length ?? 0,
    removeAllRanges: () => undefined,
    addRange: () => undefined,
  } as unknown as Selection;
  let prevented = 0;
  let stopped = 0;
  const range = { selectNodeContents: () => undefined } as unknown as Range;

  assert.equal(
    handleHubSpotPlaceholderTab(
      {
        key: "Tab",
        shiftKey: false,
        preventDefault: () => {
          prevented += 1;
        },
        stopPropagation: () => {
          stopped += 1;
        },
      },
      editor,
      selection,
      { createRange: () => range },
    ),
    true,
  );
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test("não navega quando a seleção está fora do editor", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML = "<p>%CAMPO%</p>";
  const outside = document.createTextNode("fora");
  const selection = {
    anchorNode: outside,
    anchorOffset: 0,
  } as unknown as Selection;

  assert.equal(moveToNextHubSpotPlaceholder(editor, selection), false);
});

test("insere lotes em ordem, cedendo um frame e mantendo a seleção", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const inserted: string[] = [];
  let yields = 0;
  let now = 0;
  const testBoundary = createTestBoundary();
  const result = await insertStructuredBatches(editor, ["<p>A</p>", "<p>B</p>"], {
    insertHtml: (_editor, html) => {
      inserted.push(html);
      return true;
    },
    yieldFrame: async () => {
      yields += 1;
    },
    selectionBelongs: () => true,
    now: () => (now += 2),
    createBoundary: () => testBoundary.boundary,
  });

  assert.equal(result.inserted, true);
  assert.deepEqual(inserted, ["<p>A</p>", "<p>B</p>"]);
  assert.equal(yields, 1);
  assert.deepEqual(result.batchDurationsMs, [2, 2]);
  assert.deepEqual(testBoundary.stats(), {
    placeCalls: 3,
    finishCalls: 1,
    cleanupCalls: 0,
  });
});

test("interrompe lotes quando a seleção deixa o editor", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  let selectionChecks = 0;
  let insertions = 0;
  const testBoundary = createTestBoundary();
  const result = await insertStructuredBatches(editor, ["<p>A</p>", "<p>B</p>"], {
    insertHtml: () => {
      insertions += 1;
      return true;
    },
    yieldFrame: async () => undefined,
    selectionBelongs: () => {
      selectionChecks += 1;
      return selectionChecks < 3;
    },
    createBoundary: () => testBoundary.boundary,
  });

  assert.equal(result.inserted, false);
  assert.equal(insertions, 1);
  assert.equal(testBoundary.stats().cleanupCalls, 1);
});

test("restaura a âncora quando o navegador deixa o cursor dentro do primeiro li", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const testBoundary = createTestBoundary();
  const inserted: string[] = [];
  const result = await insertStructuredBatches(
    editor,
    ["<ol><li>Primeiro</li></ol>", "<p>Depois</p>"],
    {
      insertHtml: (_editor, html) => {
        inserted.push(html);
        testBoundary.destabilize();
        return true;
      },
      yieldFrame: async () => undefined,
      selectionBelongs: () => true,
      createBoundary: () => testBoundary.boundary,
    },
  );

  assert.equal(result.inserted, true);
  assert.deepEqual(inserted, ["<ol><li>Primeiro</li></ol>", "<p>Depois</p>"]);
  assert.equal(testBoundary.stats().placeCalls, 3);
});

test("restaura a âncora quando o navegador deixa o cursor no início do bloco", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const testBoundary = createTestBoundary();
  let insertions = 0;
  const result = await insertStructuredBatches(editor, ["<p>A</p>", "<p>B</p>"], {
    insertHtml: () => {
      insertions += 1;
      testBoundary.destabilize();
      return true;
    },
    yieldFrame: async () => undefined,
    selectionBelongs: () => true,
    createBoundary: () => testBoundary.boundary,
  });

  assert.equal(result.inserted, true);
  assert.equal(insertions, 2);
  assert.equal(testBoundary.stats().placeCalls, 3);
});

test("continua os oito lotes quando o HubSpot altera o cursor entre frames", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const testBoundary = createTestBoundary();
  const batches = Array.from({ length: 8 }, (_, index) => `<p>Lote ${index + 1}</p>`);
  const inserted: string[] = [];
  let outsideListChecks = 0;
  let now = 0;
  const result = await insertStructuredBatches(editor, batches, {
    insertHtml: (_editor, html) => {
      inserted.push(html);
      if (inserted.length === 1) testBoundary.remove();
      return true;
    },
    yieldFrame: async () => undefined,
    ensureOutsideList: () => {
      outsideListChecks += 1;
      return true;
    },
    selectionBelongs: () => true,
    createBoundary: () => testBoundary.boundary,
    now: () => (now += 1),
  });

  assert.equal(result.inserted, true);
  assert.deepEqual(inserted, batches);
  assert.equal(result.batchDurationsMs.length, 8);
  assert.deepEqual(result.batchDurationsMs, Array.from({ length: 8 }, () => 1));
  assert.equal(outsideListChecks, 8);
  assert.equal(testBoundary.stats().placeCalls, 2);
});

test("continua pelo cursor nativo se o HubSpot remover o marcador técnico", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const testBoundary = createTestBoundary();
  let insertions = 0;
  const result = await insertStructuredBatches(editor, ["<p>A</p>", "<p>B</p>"], {
    insertHtml: () => {
      insertions += 1;
      testBoundary.remove();
      return true;
    },
    yieldFrame: async () => undefined,
    selectionBelongs: () => true,
    createBoundary: () => testBoundary.boundary,
    ensureOutsideList: () => true,
  });

  assert.equal(result.inserted, true);
  assert.equal(insertions, 2);
  assert.equal(testBoundary.stats().finishCalls, 0);
  assert.equal(testBoundary.stats().cleanupCalls, 1);
});

test("sai da lista pelo fluxo nativo antes do próximo lote", () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  editor.innerHTML =
    '<ol><li id="current">Terceiro</li></ol><p id="outside"><br></p>';
  const current = editor.querySelector("#current")!;
  const outside = editor.querySelector("#outside")!;
  let anchor = current.firstChild!;
  let paragraphCommands = 0;
  let outdentCommands = 0;

  const result = ensureHubSpotSelectionOutsideList(editor, {
    getSelection: () =>
      ({ isCollapsed: true, anchorNode: anchor }) as unknown as Selection,
    insertParagraph: () => {
      paragraphCommands += 1;
      if (paragraphCommands === 2) anchor = outside;
      return true;
    },
    outdent: () => {
      outdentCommands += 1;
      return true;
    },
  });

  assert.equal(result, true);
  assert.equal(paragraphCommands, 2);
  assert.equal(outdentCommands, 1);
  assert.equal(anchor, outside);
});

test("mantém conteúdo anterior e posterior em torno dos lotes", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const testBoundary = createTestBoundary();
  let rendered = "ANTES|ANCHOR|DEPOIS";
  const result = await insertStructuredBatches(
    editor,
    ["<ol><li>Um</li></ol>", "<p>Meio</p>", "<ul><li>Bullet</li></ul>"],
    {
      insertHtml: (_editor, html) => {
        rendered = rendered.replace("ANCHOR", `${html}ANCHOR`);
        return true;
      },
      yieldFrame: async () => undefined,
      selectionBelongs: () => true,
      createBoundary: () => ({
        ...testBoundary.boundary,
        finish: () => {
          rendered = rendered.replace("ANCHOR", "");
          return testBoundary.boundary.finish();
        },
      }),
    },
  );

  assert.equal(result.inserted, true);
  assert.equal(
    rendered,
    "ANTES|<ol><li>Um</li></ol><p>Meio</p><ul><li>Bullet</li></ul>|DEPOIS",
  );
});

test("rejeita mais de 100 lotes antes da primeira inserção", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  let insertions = 0;
  const result = await insertStructuredBatches(
    editor,
    Array.from({ length: 101 }, () => "<p>x</p>"),
    {
      insertHtml: () => {
        insertions += 1;
        return true;
      },
      selectionBelongs: () => true,
    },
  );

  assert.equal(result.inserted, false);
  assert.equal(insertions, 0);
});

test("bloqueia duas expansões concorrentes no mesmo editor", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = runExclusiveHubSpotExpansion(editor, async () => {
    await pending;
    return "first";
  });
  const duplicate = await runExclusiveHubSpotExpansion(editor, async () => "duplicate");
  release();

  assert.equal(duplicate, null);
  assert.equal(await first, "first");
  assert.equal(
    await runExclusiveHubSpotExpansion(editor, async () => "next"),
    "next",
  );
});

test("normaliza blocos div sem achatar parágrafos e listas", () => {
  const document = createDocument();
  const html = [
    "<div>Notícia inicial.</div>",
    "<div><br></div>",
    "<div>Valores disponíveis:</div>",
    "<div>%Print_Extrato%</div>",
    "<div>O fluxo será este:</div>",
    "<div><ul><li>Solicite o saque.</li><li>Avise por aqui.</li></ul></div>",
    "<div>Mensagem posterior.</div>",
  ].join("");

  const prepared = prepareHubSpotHtml(html, document);

  assert.equal(
    prepared.html,
    '<p>Notícia inicial.</p><p><br></p><p>Valores disponíveis:</p>' +
      '<p><span data-lilackeys-placeholder="true">%Print_Extrato%</span></p>' +
      '<p>O fluxo será este:</p><ul><li>Solicite o saque.</li>' +
      '<li>Avise por aqui.</li></ul><p>Mensagem posterior.</p>',
  );
  assert.doesNotMatch(prepared.html, /<div\b/i);
  assert.match(prepared.html, /<\/p><ul><li>/);
  assert.match(prepared.html, /<\/ul><p>Mensagem posterior/);
});

test("normaliza macros legadas com texto e conteúdo inline soltos", () => {
  const document = createDocument();
  const plain = prepareHubSpotHtml(
    "Primeira linha\n\nSegunda linha com %CAMPO%",
    document,
  );
  const inline = prepareHubSpotHtml(
    '<strong>Início</strong><br><a href="https://example.com">Link</a>',
    document,
  );

  assert.equal(
    plain.html,
    '<p>Primeira linha<br><br>Segunda linha com ' +
      '<span data-lilackeys-placeholder="true">%CAMPO%</span></p>',
  );
  assert.equal(
    inline.html,
    '<p><strong>Início</strong><br><a href="https://example.com">Link</a></p>',
  );
});

test("preserva macros existentes baseadas em parágrafos", () => {
  const document = createDocument();
  const html =
    '<p>Transferência registrada com sucesso.</p><p><br></p>' +
    '<p>Disponível até %dia_semana% (%dataMes%).</p><p><br></p>' +
    '<p>Acesse o <a href="https://example.com"><strong>perfil</strong></a>.</p>' +
    '<p>Qualquer dúvida, sigo à disposição! 💙</p>';

  const prepared = prepareHubSpotHtml(html, document);
  const container = document.createElement("div");
  container.innerHTML = prepared.html;

  assert.equal(container.querySelectorAll("p").length, 6);
  assert.equal(container.querySelectorAll("p > br").length, 2);
  assert.equal(container.querySelectorAll("a strong").length, 1);
  assert.equal(
    container.querySelectorAll("[data-lilackeys-placeholder]").length,
    2,
  );
  assert.doesNotMatch(prepared.html, /<div\b/i);
});
