import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import { parseHTML } from "linkedom";

import {
  classifyHubSpotPayload,
  findHubSpotEditor,
  htmlToHubSpotPlainText,
  insertStructuredBatches,
  isHubSpotPage,
  measureHubSpotResponsiveness,
  prepareHubSpotHtml,
  runExclusiveHubSpotExpansion,
  sanitizeHubSpotHtml,
  selectFirstHubSpotPlaceholder,
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

test("preserva HTML semântico, links seguros e imagens HTTPS limitadas", () => {
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
  assert.match(prepared.html, /\[Imagem: Incorporada\]/);
  assert.match(prepared.html, /\[Imagem: Temporária\]/);
  assert.doesNotMatch(prepared.html, /class=|target=|data:image|blob:/);
  assert.equal(prepared.acceptedImages, 1);
  assert.equal(prepared.rejectedImages, 2);
});

test("limita imagens HTTPS e remove pixels de rastreamento", () => {
  const document = createDocument();
  const images = [
    '<img src="https://cdn.example.com/track.gif" alt="Track" width="1" height="1">',
    ...Array.from(
      { length: 4 },
      (_, index) => `<img src="https://cdn.example.com/${index}.png" alt="Imagem ${index}">`,
    ),
  ].join("");
  const prepared = prepareHubSpotHtml(images, document);

  assert.equal(prepared.acceptedImages, 3);
  assert.equal(prepared.rejectedImages, 2);
  assert.equal((prepared.html.match(/<img\b/g) ?? []).length, 3);
  assert.match(prepared.html, /\[Imagem: Track\]/);
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

test("insere lotes em ordem, cedendo um frame e mantendo a seleção", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  const inserted: string[] = [];
  let yields = 0;
  let now = 0;
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
  });

  assert.equal(result.inserted, true);
  assert.deepEqual(inserted, ["<p>A</p>", "<p>B</p>"]);
  assert.equal(yields, 1);
  assert.deepEqual(result.batchDurationsMs, [2, 2]);
});

test("interrompe lotes quando a seleção deixa o editor", async () => {
  const document = createDocument();
  const editor = document.createElement("div") as unknown as HTMLElement;
  let selectionChecks = 0;
  let insertions = 0;
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
  });

  assert.equal(result.inserted, false);
  assert.equal(insertions, 1);
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
