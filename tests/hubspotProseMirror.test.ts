import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { DOMParser as ProseMirrorParser, Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import {
  expandHubSpotMacro,
  handleHubSpotPlaceholderTab,
  prepareHubSpotHtml,
} from "../src/content/editors/hubspotEditor.ts";
import {
  insertHubSpotModelHtml,
  insertHubSpotBlockHtml,
  selectInsertedPlaceholder,
  shortcutRange,
} from "../src/content/editors/hubspotInsertion.ts";
import { buildMacroSnapshot } from "../src/content/macroIndex.ts";

const schema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, "paragraph block*", "block").update("image", {
    ...basicSchema.spec.nodes.get("image"),
    inline: true,
    group: "inline",
    attrs: {
      src: {}, alt: { default: null }, title: { default: null },
      width: { default: null }, height: { default: null },
    },
    parseDOM: [{ tag: "img[src]", getAttrs: (element: HTMLElement) => ({
      src: element.getAttribute("src"), alt: element.getAttribute("alt"),
      width: element.getAttribute("width"), height: element.getAttribute("height"),
    }) }],
    toDOM: node => ["img", node.attrs],
  }),
  marks: basicSchema.spec.marks
    .addToEnd("underline", { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] })
    .addToEnd("strike", { parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }], toDOM: () => ["s", 0] }),
});

function createHarness(initialHtml = "<p>CODE</p>") {
  const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
    url: "https://app.hubspot.com/", pretendToBeVisual: true,
  });
  const { window } = dom;
  const bindings: Record<string, unknown> = {
    window, document: window.document, navigator: window.navigator,
    Node: window.Node, HTMLElement: window.HTMLElement, MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    innerHeight: 800, pageYOffset: 0,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(bindings)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const initial = window.document.createElement("div");
  initial.innerHTML = initialHtml;
  const view = new EditorView(window.document.querySelector("main"), {
    state: EditorState.create({ schema, doc: ProseMirrorParser.fromSchema(schema).parse(initial) }),
    handleScrollToSelection: () => true,
  });
  view.focus();

  const yieldFrame = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
  const createPasteEvent = (html: string, text: string): ClipboardEvent => {
    const event = new window.Event("paste", { bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(event, "clipboardData", { value: {
      files: [], types: ["text/html", "text/plain"],
      getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? text : "",
    } });
    return event as unknown as ClipboardEvent;
  };
  class TestDataTransfer {
    private entries = new Map<string, string>();
    files = [];
    get types() { return [...this.entries.keys()]; }
    setData(type: string, value: string) { this.entries.set(type, value); }
    getData(type: string) { return this.entries.get(type) ?? ""; }
  }
  class TestClipboardEvent extends window.Event {
    clipboardData?: TestDataTransfer;
    constructor(type: string, init: EventInit & { clipboardData?: TestDataTransfer } = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData;
    }
  }
  Object.defineProperty(window, "DataTransfer", { value: TestDataTransfer });
  Object.defineProperty(window, "ClipboardEvent", { value: TestClipboardEvent });
  previous.set("ClipboardEvent", Object.getOwnPropertyDescriptor(globalThis, "ClipboardEvent"));
  Object.defineProperty(globalThis, "ClipboardEvent", { configurable: true, value: TestClipboardEvent });

  function selectTrigger() {
    let end = -1;
    view.state.doc.descendants((node, position) => {
      const offset = node.isText ? node.text!.indexOf("CODE") : -1;
      if (offset >= 0) end = position + offset + 4;
    });
    assert.ok(end >= 0, "the fixture must contain the shortcut");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    view.focus();
    const range = shortcutRange(view.dom, 4);
    assert.equal(range?.toString(), "CODE");
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range!);
    window.document.dispatchEvent(new window.Event("selectionchange"));
  }

  async function insert(html: string) {
    selectTrigger();
    return insertHubSpotModelHtml(view.dom, prepareHubSpotHtml(html, window.document).html, {
      yieldFrame, createPasteEvent,
    });
  }

  return { window, view, yieldFrame, createPasteEvent, selectTrigger, insert,
    close() {
      view.destroy();
      window.close();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}

test("ProseMirror real preserva parágrafos da regressão Ag2D após colagem e reconciliação", async () => {
  const harness = createHarness("<p>ANTES CODE DEPOIS</p>");
  try {
    // PM interprets a paste as plain text while its keydown Shift state is set.
    let releasedShiftKeyCode = 0;
    harness.view.dom.addEventListener("keyup", event => {
      if ((event as KeyboardEvent).key === "Shift") {
        releasedShiftKeyCode = (event as KeyboardEvent).keyCode;
      }
    });
    harness.view.dom.dispatchEvent(new harness.window.KeyboardEvent("keydown", {
      key: " ", keyCode: 32, shiftKey: true, bubbles: true,
    }));
    const result = await harness.insert(
      '<p>Transferência registrada.</p><p><br></p>' +
      '<p>Disponível até %dia_semana% (%dataMes%).</p><p><br></p>' +
      '<p>Acesse o <a href="https://example.test/perfil"><strong>perfil</strong></a>.</p>' +
      '<p>À disposição! 💙</p>',
    );
    assert.equal(result.inserted, true, result.failureReason);
    assert.equal(releasedShiftKeyCode, 16);
    assert.equal(harness.view.state.doc.childCount, 6);
    assert.equal(harness.view.state.doc.child(1).content.size, 0);
    assert.equal(harness.view.state.doc.child(3).content.size, 0);
    assert.equal(harness.view.state.doc.firstChild!.textContent, "ANTES Transferência registrada.");
    assert.equal(harness.view.state.doc.lastChild!.textContent, "À disposição! 💙 DEPOIS");
    assert.equal(harness.view.dom.querySelector("a strong")?.textContent, "perfil");
    assert.equal(harness.view.dom.querySelector("[data-lilackeys-placeholder]"), null);
    assert.equal(selectInsertedPlaceholder(harness.view.dom, result.insertedRange!), true);
    assert.equal(harness.window.getSelection()!.toString(), "%dia_semana%");

    harness.window.document.dispatchEvent(new harness.window.Event("selectionchange"));
    harness.view.dispatch(harness.view.state.tr.insertText("sexta-feira"));
    const event = new harness.window.KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    assert.equal(handleHubSpotPlaceholderTab(event, harness.view.dom, harness.window.getSelection()), true);
    assert.equal(event.defaultPrevented, true);
    assert.equal(harness.window.getSelection()!.toString(), "%dataMes%");
  } finally { harness.close(); }
});

test("expansão completa usa cache e colagem do modelo para rich e structured", async () => {
  for (const html of ["<p>Olá, %NOME%.</p><p>Protocolo %PROTOCOLO%.</p>", "<p>Nova linha.</p>".repeat(45)]) {
    const harness = createHarness("<p>Antes CODE Depois</p>");
    try {
      harness.selectTrigger();
      const selection = harness.window.getSelection()!;
      selection.collapseToEnd();
      const snapshot = buildMacroSnapshot([{
        id: "macro", nome: "Fixture", atalho: "CODE", textoExpandido: html,
      }]);
      const outcome = await expandHubSpotMacro(harness.view.dom, snapshot);
      assert.equal(outcome, "expanded");
      assert.equal(harness.view.state.doc.textContent.startsWith("Antes "), true);
      assert.equal(harness.view.state.doc.textContent.endsWith(" Depois"), true);
      assert.equal(harness.view.state.doc.textContent.includes("CODE"), false);
      if (html.includes("%NOME%")) assert.equal(selection.toString(), "%NOME%");
      else assert.equal(selection.isCollapsed, true);
    } finally { harness.close(); }
  }
});

test("expansão cancela quando o cursor muda durante a preparação structured", async () => {
  const harness = createHarness("<p>CODE</p><p>outro local</p>");
  const originalRaf = globalThis.requestAnimationFrame;
  try {
    harness.selectTrigger();
    harness.window.getSelection()!.collapseToEnd();
    let frames = 0;
    globalThis.requestAnimationFrame = callback => originalRaf(time => {
      if (frames++ === 0) harness.view.dispatch(harness.view.state.tr.setSelection(TextSelection.create(harness.view.state.doc, 1)));
      callback(time);
    });
    const snapshot = buildMacroSnapshot([{ id: "x", nome: "Fixture", atalho: "CODE", textoExpandido: "<p>Linha.</p>".repeat(45) }]);
    assert.equal(await expandHubSpotMacro(harness.view.dom, snapshot), "failed");
    assert.equal(harness.view.state.doc.textContent, "CODEoutro local");
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    harness.close();
  }
});

test("duas expansões concorrentes geram uma única inserção e nenhum log de conteúdo", async () => {
  const harness = createHarness();
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const messages: unknown[][] = [];
  console.info = (...args) => messages.push(args);
  console.warn = (...args) => messages.push(args);
  try {
    harness.selectTrigger();
    harness.window.getSelection()!.collapseToEnd();
    const snapshot = buildMacroSnapshot([{ id: "x", nome: "Privado", atalho: "CODE", textoExpandido: "<p>Conteúdo de teste.</p><p>Fim.</p>" }]);
    const results = await Promise.all([
      expandHubSpotMacro(harness.view.dom, snapshot),
      expandHubSpotMacro(harness.view.dom, snapshot),
    ]);
    assert.deepEqual(results, ["expanded", "failed"]);
    assert.equal(harness.view.state.doc.textContent, "Conteúdo de teste.Fim.");
    assert.deepEqual(messages, []);
  } finally {
    console.info = originalInfo; console.warn = originalWarn; harness.close();
  }
});

test("limite absoluto bloqueia conteúdo e a telemetria só inclui métricas permitidas", async () => {
  const harness = createHarness();
  const messages: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args) => messages.push(args);
  try {
    harness.selectTrigger(); harness.window.getSelection()!.collapseToEnd();
    Object.defineProperty(harness.window.document, "execCommand", { value: () => true });
    const snapshot = buildMacroSnapshot([{ id: "x", nome: "Privado", atalho: "CODE", textoExpandido: "<p>" + "x".repeat(129 * 1024) + "</p>" }]);
    assert.equal(await expandHubSpotMacro(harness.view.dom, snapshot), "blocked");
    assert.equal(harness.view.state.doc.textContent, "CODE");
    assert.equal(messages.length, 1);
    assert.deepEqual(Object.keys(messages[0][1] as object).sort(), ["blocks", "durationMs", "editorType", "fallbackReason", "strategy"]);
    assert.doesNotMatch(JSON.stringify(messages), /Privado|CODE|<p>|xxx/);
  } finally { console.warn = originalWarn; harness.close(); }
});

test("Tab depois do último placeholder e Shift+Tab preservam comportamento normal", async () => {
  const harness = createHarness();
  try {
    const result = await harness.insert("<p>%CAMPO%</p>");
    assert.equal(result.inserted, true);
    selectInsertedPlaceholder(harness.view.dom, result.insertedRange!);
    for (const shiftKey of [false, true]) {
      const event = new harness.window.KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });
      assert.equal(handleHubSpotPlaceholderTab(event, harness.view.dom, harness.window.getSelection()), false);
      assert.equal(event.defaultPrevented, false);
    }
  } finally { harness.close(); }
});

test("placeholder não atravessa quebra de linha ou parágrafo", async () => {
  const harness = createHarness();
  try {
    const result = await harness.insert("<p>%INÍCIO<br>FIM%</p><p>%VÁLIDO%</p>");
    assert.equal(result.inserted, true, result.failureReason);
    assert.equal(selectInsertedPlaceholder(harness.view.dom, result.insertedRange!), true);
    assert.equal(harness.window.getSelection()!.toString(), "%VÁLIDO%");
  } finally { harness.close(); }
});

test("colagem aguarda reconciliação e cancela com foco/seleção alterados", async () => {
  for (const change of ["focus", "selection", "detach"]) {
    const harness = createHarness();
    try {
      let fallbacks = 0;
      harness.view.setProps({ handleDOMEvents: { paste: () => true } });
      Object.defineProperty(harness.window.document, "execCommand", { value: () => { fallbacks += 1; return true; } });
      harness.selectTrigger();
      let frames = 0;
      const result = await insertHubSpotModelHtml(harness.view.dom, "<p>Macro</p>", {
        createPasteEvent: harness.createPasteEvent,
        yieldFrame: async () => {
          if (frames++ > 0) return;
          if (change === "detach") harness.view.dom.remove();
          else if (change === "selection") harness.window.getSelection()!.collapseToStart();
          else {
            const input = harness.window.document.createElement("input");
            harness.window.document.body.append(input);
            input.focus();
          }
        },
      });
      assert.equal(result.inserted, false);
      assert.equal(fallbacks, 0);
      assert.equal(harness.view.state.doc.textContent, "CODE");
    } finally { harness.close(); }
  }
});

test("fallback só é usado para colagem ignorada e confere a estrutura final", async () => {
  for (const flatten of [false, true]) {
    const harness = createHarness();
    try {
      let fallbacks = 0;
      harness.view.setProps({ handleDOMEvents: { paste: () => true } });
      Object.defineProperty(harness.window.document, "execCommand", { value: (_command: string, _ui: boolean, html: string) => {
        fallbacks += 1;
        if (flatten) harness.view.dispatch(harness.view.state.tr.insertText("PrimeiroSegundo"));
        else harness.view.pasteHTML(html);
        return true;
      } });
      const result = await harness.insert("<p>Primeiro</p><p>Segundo</p>");
      assert.equal(result.inserted, !flatten, result.failureReason);
      assert.equal(fallbacks, 1);
      assert.equal(harness.view.state.doc.textContent, "PrimeiroSegundo");
      if (flatten) assert.equal(result.failureReason, "reconciled-structure-mismatch");
    } finally { harness.close(); }
  }
});

test("placeholder inicial é limitado à macro e Tab cruza formatação inline", async () => {
  const harness = createHarness("<p>%ANTIGO%</p><p>CODE</p><p>%POSTERIOR%</p>");
  try {
    const result = await harness.insert("<p>%NO<strong>ME</strong>%</p><p>%PRO<em>TOCOLO</em>%</p>");
    assert.equal(result.inserted, true, result.failureReason);
    assert.equal(selectInsertedPlaceholder(harness.view.dom, result.insertedRange!), true);
    assert.equal(harness.window.getSelection()!.toString(), "%NOME%");
    const event = new harness.window.KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    assert.equal(handleHubSpotPlaceholderTab(event, harness.view.dom, harness.window.getSelection()), true);
    assert.equal(harness.window.getSelection()!.toString(), "%PROTOCOLO%");
  } finally { harness.close(); }
});

test("ProseMirror preserva conteúdo e cursor em 25/50/100/128 KB", async (context) => {
  for (const kilobytes of [25, 50, 100, 128]) {
    const harness = createHarness("<p>CODE restante</p>");
    try {
      const unit = `<p>Etapa ${"á😊".repeat(120)}</p>`;
      const html = unit.repeat(Math.floor(kilobytes * 1024 / unit.length));
      const started = performance.now();
      const result = await harness.insert(html);
      const duration = performance.now() - started;
      assert.equal(result.inserted, true, result.failureReason);
      assert.equal(harness.view.state.doc.childCount, Math.floor(kilobytes * 1024 / unit.length));
      assert.equal(harness.view.state.doc.textContent.endsWith(" restante"), true);
      assert.equal(harness.window.getSelection()!.isCollapsed, true);
      const after = harness.window.document.createRange();
      const caret = harness.window.getSelection()!.getRangeAt(0);
      after.setStart(caret.endContainer, caret.endOffset);
      after.setEnd(harness.view.dom, harness.view.dom.childNodes.length);
      assert.equal(after.toString(), " restante");
      context.diagnostic(`${kilobytes} KB: ${duration.toFixed(1)} ms no DOM de teste; inserção ${result.batchDurationsMs[0].toFixed(1)} ms`);
    } finally { harness.close(); }
  }
});

test("ProseMirror real preserva HTML legado, texto puro e formatação inline", async () => {
  for (const html of [
    '<div>Primeiro.</div><div><br></div><div>Segundo <b>forte</b>.</div>',
    'Primeiro.\n\nSegundo <strong>forte</strong>.',
    '<strong>Primeiro.</strong><br><em>Segundo.</em><br><u>Sublinhado</u> <del>Tachado</del>',
    '<p>Primeiro<br>Segundo<br>Terceiro</p>',
  ]) {
    const harness = createHarness();
    try {
      const result = await harness.insert(html);
      assert.equal(result.inserted, true, result.failureReason);
      assert.ok(harness.view.state.doc.textContent.includes("Primeiro"));
      assert.ok(harness.view.state.doc.textContent.includes("Segundo"));
      if (html.includes("<del>")) {
        assert.equal(harness.view.dom.querySelector("u")?.textContent, "Sublinhado");
        assert.equal(harness.view.dom.querySelector("s")?.textContent, "Tachado");
      }
      assert.equal(harness.window.getSelection()!.isCollapsed, true);
    } finally { harness.close(); }
  }
});

test("preserva parágrafos vazios nas extremidades e imagens sem texto", async () => {
  for (const html of [
    '<p><br></p><p>Texto</p><p><br></p>',
    '<p><img src="https://example.test/image.png"></p>',
    '<p><img src="https://example.test/image.png">Texto</p>',
    '<p>Texto<img src="https://example.test/image.png"></p>',
  ]) {
    const harness = createHarness();
    try {
      const result = await harness.insert(html);
      assert.equal(result.inserted, true, result.failureReason);
      if (html.includes("<br>")) assert.equal(harness.view.state.doc.childCount, 3);
      assert.equal(harness.window.getSelection()!.isCollapsed, true);
    } finally { harness.close(); }
  }
});

test("ProseMirror real mantém listas independentes, aninhadas e parágrafos das regressões PJPJ/PFPJ/SaquePJ", async () => {
  const harness = createHarness("<p>INTRO</p><p>CODE</p><p>POSTERIOR</p>");
  try {
    const result = await harness.insert(
      '<p>Seguiremos por estas etapas:</p><ol><li><p><strong>Validação</strong></p></li>' +
      '<li><p>Saque</p></li><li><p>Conclusão</p></li></ol><p><br></p>' +
      '<p>Preencha o termo.</p><p>Valores disponíveis: %Print_Extrato%</p>' +
      '<ul><li><p>Solicite o saque.</p></li><li><p>Documentos</p><ul><li><p>Contrato</p></li>' +
      '<li><p>Certificado</p><ul><li><p>Documento dos sócios</p></li></ul></li></ul></li></ul>' +
      '<p>Outra etapa.</p><ol><li><p>Primeiro</p></li><li><p>Segundo</p></li></ol>' +
      '<p>Mensagem final 🫡</p>',
    );
    assert.equal(result.inserted, true, result.failureReason);
    const ordered = harness.view.dom.querySelectorAll(":scope > ol");
    assert.equal(ordered.length, 2);
    assert.equal(ordered[0].children.length, 3);
    assert.equal(ordered[1].getAttribute("start"), null);
    assert.equal(harness.view.dom.querySelectorAll("ul").length, 3);
    assert.equal(harness.view.dom.querySelector("ul ul ul li")?.textContent, "Documento dos sócios");
    assert.equal(harness.view.dom.querySelectorAll("li:empty").length, 0);
    assert.equal(harness.view.state.doc.firstChild!.textContent, "INTRO");
    assert.equal(harness.view.state.doc.lastChild!.textContent, "POSTERIOR");
    assert.equal(harness.view.state.doc.child(harness.view.state.doc.childCount - 2).textContent, "Mensagem final 🫡");
    assert.equal(selectInsertedPlaceholder(harness.view.dom, result.insertedRange!), true);
    assert.equal(harness.window.getSelection()!.toString(), "%Print_Extrato%");
  } finally { harness.close(); }
});

test("ProseMirror real preserva links HTTPS/mailto/tel e imagens suportadas", async () => {
  const harness = createHarness();
  try {
    const html = '<p><a href="https://example.test/">Site</a> <a href="mailto:test@example.test">Email</a> ' +
      '<a href="tel:+551100000000">Telefone</a></p><p><img src="https://example.test/image.png" alt="Imagem" width="320" height="240"></p>' +
      '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Local"></p><p>Fim</p>';
    const result = await harness.insert(html);
    assert.equal(result.inserted, true, result.failureReason);
    assert.deepEqual(Array.from(harness.view.dom.querySelectorAll("a")).map(link => link.getAttribute("href")), [
      "https://example.test/", "mailto:test@example.test", "tel:+551100000000",
    ]);
    assert.equal(harness.view.dom.querySelectorAll("img").length, 2);
    assert.equal(harness.view.dom.querySelector("img")!.getAttribute("width"), "320");
    assert.equal(harness.view.dom.querySelector("img")!.getAttribute("height"), "240");
  } finally { harness.close(); }
});

test("ProseMirror real insere macro structured de 5 KB completa em uma transação de colagem", async () => {
  const harness = createHarness();
  try {
    const html = Array.from({ length: 51 }, (_, index) =>
      `<p><strong>Etapa ${index}</strong> ${"conteúdo ".repeat(9)}</p>`).join("");
    assert.ok(html.length >= 4981);
    const result = await harness.insert(html);
    assert.equal(result.inserted, true, result.failureReason);
    assert.equal(result.batchDurationsMs.length, 1);
    assert.equal(harness.view.state.doc.childCount, 51);
    assert.equal(harness.view.dom.querySelectorAll("strong").length, 51);
    assert.equal(harness.view.state.doc.lastChild!.textContent.startsWith("Etapa 50"), true);
  } finally { harness.close(); }
});

test("ProseMirror real não duplica colagem cancelada ou parcialmente aceita", async () => {
  for (const partial of [false, true]) {
    const harness = createHarness();
    try {
      let fallbacks = 0;
      Object.defineProperty(harness.window.document, "execCommand", { value: () => { fallbacks += 1; return true; } });
      harness.view.setProps({ handlePaste: (view) => {
        if (partial) view.dispatch(view.state.tr.insertText("Parcial"));
        return true;
      } });
      const result = await harness.insert("<p>Completa</p><p>Final</p>");
      assert.equal(result.inserted, false);
      assert.equal(result.failureReason, partial ? "reconciled-structure-mismatch" : "paste-cancelled-without-insertion");
      assert.equal(fallbacks, 0);
      assert.equal(harness.view.state.doc.textContent, partial ? "Parcial" : "CODE");
    } finally { harness.close(); }
  }
});

const sequentialMacro = '<p>Seguiremos por estas etapas:</p>' +
  '<ol><li><p><strong>Validação</strong></p></li><li><p>Saque</p></li><li><p>Conclusão</p></li></ol>' +
  '<p><br></p><p>Preencha o termo.</p><p>Documentos %DOCUMENTO%.</p>' +
  '<ul><li><p>Contrato</p></li><li><p>Certificado</p><ul><li><p>Sócios</p></li></ul></li></ul>' +
  '<p><a href="https://example.test/termo"><strong>Termo</strong></a></p>' +
  '<ol><li><p>Outra etapa</p></li></ol><p>Fim %PROTOCOLO% 🫡</p>';

test("observador ProseMirror real reproduz achatamento de blocos inseridos dentro de p", async () => {
  const harness = createHarness("<p><strong>BvTT CODE fechamento</strong></p>");
  try {
    harness.selectTrigger();
    const selected = harness.window.getSelection()!.getRangeAt(0);
    const content = selected.createContextualFragment("<p>Etapas:</p><ol><li>Primeiro</li></ol><p>Final</p>");
    selected.deleteContents();
    selected.insertNode(content);
    await harness.yieldFrame(); await harness.yieldFrame();
    assert.equal(harness.view.state.doc.childCount, 1);
    assert.equal(harness.view.dom.querySelector("ol"), null);
    assert.ok(harness.view.state.doc.textContent.includes("Etapas:PrimeiroFinal"));
  } finally { harness.close(); }
});

test("inserção em blocos irmãos preserva PJPJ após BvTT, no meio/final de p, inline e li", async () => {
  for (const initial of [
    '<p>Olá, Lucas!</p><p>Orientações.</p><p>Att,<br><strong>GustavoCODE</strong></p>',
    '<p>BvTT <strong><em>preenchido CODE fechamento</em></strong></p><p>Att,<br>Gustavo</p>',
    '<p>ANTES</p><p>CODE</p><p>DEPOIS</p>',
    '<ul><li><p>Anterior</p></li><li><p><em>LucasCODE</em></p></li><li><p>Posterior</p></li></ul>',
    '<ol start="4"><li><p>Anterior</p></li><li><p>CODE</p></li><li><p>Posterior</p></li></ol>',
    '<p>CODE</p>',
  ]) {
    const harness = createHarness(initial);
    try {
      harness.selectTrigger();
      const before = harness.view.state.doc.textContent.replace("CODE", "");
      const prepared = prepareHubSpotHtml(sequentialMacro, harness.window.document);
      const expected = harness.window.document.createElement("div");
      expected.innerHTML = prepared.html;
      const result = await insertHubSpotBlockHtml(harness.view.dom, prepared.html, { yieldFrame: harness.yieldFrame });
      assert.equal(result.inserted, true, result.failureReason);
      assert.equal(harness.view.state.doc.textContent.replace(expected.textContent!, ""), before);
      const macroLists = Array.from(harness.view.dom.querySelectorAll(":scope > ol"));
      assert.equal(macroLists.some(list => list.children.length === 3 && list.textContent === "ValidaçãoSaqueConclusão"), true);
      assert.ok(harness.view.dom.querySelector(":scope > ul ul"));
      assert.equal(harness.view.dom.querySelectorAll("li:empty").length, 0);
      assert.equal(harness.view.dom.querySelector("a strong")?.textContent, "Termo");
      assert.equal(harness.window.getSelection()!.isCollapsed, true);
      assert.equal(selectInsertedPlaceholder(harness.view.dom, result.insertedRange!), true);
      assert.equal(harness.window.getSelection()!.toString(), "%DOCUMENTO%");
      harness.window.document.dispatchEvent(new harness.window.Event("selectionchange"));
      harness.view.dispatch(harness.view.state.tr.insertText("preenchido"));
      const tab = new harness.window.KeyboardEvent("keydown", { key: "Tab", cancelable: true });
      assert.equal(handleHubSpotPlaceholderTab(tab, harness.view.dom, harness.window.getSelection()), true);
      assert.equal(harness.window.getSelection()!.toString(), "%PROTOCOLO%");
      if (initial.includes('start="4"')) {
        assert.equal(harness.view.dom.lastElementChild?.getAttribute("start"), "6");
      }
    } finally { harness.close(); }
  }
});

test("expansão completa usa blocos irmãos mesmo com execCommand e colagem que achata HTML", async () => {
  const harness = createHarness('<p><strong>BvTT CODE fechamento</strong></p><p>Att,<br>Gustavo</p>');
  try {
    let nativeCalls = 0;
    Object.defineProperty(harness.window.document, "execCommand", { value: () => { nativeCalls += 1; return true; } });
    harness.view.setProps({ handlePaste: view => { view.dispatch(view.state.tr.insertText("achatado")); return true; } });
    harness.selectTrigger(); harness.window.getSelection()!.collapseToEnd();
    const snapshot = buildMacroSnapshot([{ id: "m", nome: "Fixture", atalho: "CODE", textoExpandido: sequentialMacro }]);
    assert.equal(await expandHubSpotMacro(harness.view.dom, snapshot), "expanded");
    assert.equal(nativeCalls, 0);
    assert.equal(harness.view.dom.querySelectorAll(":scope > ol").length, 2);
    assert.equal(harness.view.state.doc.lastChild!.textContent, "Att,Gustavo");
    assert.equal(harness.window.getSelection()!.toString(), "%DOCUMENTO%");
  } finally { harness.close(); }
});

test("blocos irmãos normalizam sublistas legadas e preservam hard_break no fim do parágrafo", async () => {
  const harness = createHarness('<p>Antes<br>CODE Depois<br></p>');
  try {
    harness.selectTrigger();
    const html = '<p>Etapas<br></p><ul><li>Documento</li><ul><li>Contrato</li></ul>' +
      '<li><ul><li>Comprovante</li></ul></li></ul><p>Fim<br><br></p>';
    const result = await insertHubSpotBlockHtml(harness.view.dom, html, { yieldFrame: harness.yieldFrame });
    assert.equal(result.inserted, true, result.failureReason);
    const lists = harness.view.dom.querySelectorAll("ul");
    assert.equal(lists.length, 3);
    assert.equal(lists[1].parentElement!.tagName, "LI");
    assert.equal(lists[2].parentElement!.tagName, "LI");
    assert.equal(harness.view.dom.querySelector("li ul")!.previousElementSibling!.tagName, "P");
    const hardBreaks: number[] = [];
    harness.view.state.doc.forEach(node => {
      if (node.type.name === "paragraph") {
        let breaks = 0; node.forEach(child => { if (child.type.name === "hard_break") breaks += 1; });
        hardBreaks.push(breaks);
      }
    });
    assert.deepEqual(hardBreaks, [1, 1, 2, 1]);
    assert.equal(harness.view.dom.querySelector("li:empty"), null);
  } finally { harness.close(); }
});

test("blocos irmãos não reinserem conteúdo quando foco muda após aceitação", async () => {
  const harness = createHarness();
  try {
    harness.selectTrigger();
    let yields = 0;
    const result = await insertHubSpotBlockHtml(harness.view.dom, '<p>Primeiro</p><p>Segundo</p>', {
      yieldFrame: async () => {
        await harness.yieldFrame();
        if (yields++ === 0) {
          const field = harness.window.document.createElement("input");
          harness.window.document.body.append(field); field.focus();
        }
      },
    });
    assert.equal(result.inserted, false);
    assert.equal(harness.view.state.doc.textContent, "PrimeiroSegundo");
  } finally { harness.close(); }
});

test("blocos irmãos limitam inspeção do bloco anterior sem destruir o atalho", async () => {
  const harness = createHarness('<p>' + 'antes '.repeat(44000) + 'CODE</p>');
  try {
    harness.selectTrigger();
    const result = await insertHubSpotBlockHtml(harness.view.dom, '<p>Macro</p>', { yieldFrame: harness.yieldFrame });
    assert.equal(result.inserted, false);
    assert.equal(result.failureReason, "existing-block-limit");
    assert.ok(harness.view.state.doc.textContent.endsWith("CODE"));
  } finally { harness.close(); }
});

test("macro rich com dois parágrafos dentro do placeholder preenchido mantém linhas e cursor", async () => {
  const harness = createHarness('<p>Boa tarde.</p><p><span>CODE</span></p><p>Att,<br>Gustavo</p>');
  try {
    Object.defineProperty(harness.window.document, "execCommand", { value: () => { throw Error("native insert must not run"); } });
    harness.selectTrigger(); harness.window.getSelection()!.collapseToEnd();
    const snapshot = buildMacroSnapshot([{ id: "m", nome: "Fixture", atalho: "CODE", textoExpandido: '<p>Saque confirmado!</p><p>Veja o <strong>Histórico</strong>.</p>' }]);
    assert.equal(snapshot.entries[0].hubspotPlan.strategy, "rich");
    assert.equal(await expandHubSpotMacro(harness.view.dom, snapshot), "expanded");
    assert.equal(harness.view.state.doc.childCount, 4);
    assert.equal(harness.view.state.doc.child(1).textContent, "Saque confirmado!");
    assert.equal(harness.view.state.doc.child(2).textContent, "Veja o Histórico.");
    assert.equal(harness.view.state.doc.child(3).textContent, "Att,Gustavo");
    const after = harness.window.document.createRange();
    const caret = harness.window.getSelection()!.getRangeAt(0);
    after.setStart(caret.endContainer, caret.endOffset); after.setEnd(harness.view.dom, harness.view.dom.childNodes.length);
    assert.equal(after.toString(), "Att,Gustavo");
    assert.doesNotMatch(harness.view.state.doc.textContent, /\u200b|\ufeff/);
  } finally { harness.close(); }
});

test("espaços isolados ao redor do atalho não criam parágrafos técnicos vazios", async () => {
  const harness = createHarness('<p> \u00a0CODE\u00a0 </p>');
  try {
    harness.selectTrigger();
    const result = await insertHubSpotBlockHtml(harness.view.dom, '<p>Primeiro</p><p>Segundo</p>', { yieldFrame: harness.yieldFrame });
    assert.equal(result.inserted, true, result.failureReason);
    assert.equal(harness.view.state.doc.childCount, 2);
    assert.equal(harness.view.state.doc.textContent, "PrimeiroSegundo");
  } finally { harness.close(); }
});

test("divisão conserva separadores inline e a lista existente após um item aninhado", async () => {
  for (const initial of [
    '<p><strong>Antes</strong> CODE <em>Depois</em></p>',
    '<ul><li><p>Anterior</p><ul><li><p>Dentro CODE restante</p></li><li><p>Último</p></li></ul></li><li><p>Depois</p></li></ul>',
  ]) {
    const harness = createHarness(initial);
    try {
      harness.selectTrigger();
      const before = harness.view.state.doc.textContent.replace("CODE", "");
      const result = await insertHubSpotBlockHtml(harness.view.dom, '<p>Macro</p><p>Fim</p>', { yieldFrame: harness.yieldFrame });
      assert.equal(result.inserted, true, result.failureReason);
      assert.equal(harness.view.state.doc.textContent.replace("MacroFim", ""), before);
      assert.equal(harness.view.dom.querySelector("li:empty"), null);
      if (initial.includes("<ul>")) assert.equal(harness.view.dom.querySelectorAll(":scope > ul").length, 2);
    } finally { harness.close(); }
  }
});
