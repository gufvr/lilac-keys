import { DOMParser, Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { buildMacroSnapshot } from "../../src/content/macroIndex.ts";
import { expandHubSpotMacro, handleHubSpotPlaceholderTab } from "../../src/content/editors/hubspotEditor.ts";
import { prepareHubSpotHtml } from "../../src/content/editors/hubspotEditor.ts";
import type { Macro } from "../../src/types/macro.ts";

const schema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, "paragraph block*", "block"),
  marks: basicSchema.spec.marks
    .addToEnd("underline", { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] })
    .addToEnd("strike", { parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }], toDOM: () => ["s", 0] }),
});
const results: { test: string; passed: boolean; durationMs: number; reason?: string }[] = [];
let lastFailure = "";
const originalWarning = console.warn;
console.warn = (...args: unknown[]) => { lastFailure = String((args[1] as { fallbackReason?: string })?.fallbackReason ?? ""); originalWarning(...args); };
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const structured = '<p>Seguiremos por estas etapas:</p><ol><li><p><strong>Validação</strong></p></li>' +
  '<li><p>Saque</p></li><li><p>Conclusão</p></li></ol><p><br></p>' +
  '<p>Termo <a href="https://example.test">link</a> %DOCUMENTO%.</p>' +
  '<ul><li><p>Contrato</p></li><li><p>Certificado</p><ul><li><p>Sócios</p></li></ul></li></ul>' +
  '<p>Fim %PROTOCOLO% 🫡</p>';
const snapshot = buildMacroSnapshot([
  { id: "a", nome: "Fixture", atalho: "BvTT", textoExpandido: '<p>Olá, %NOME%!</p><p>Orientações.</p><p>Att,<br>Gustavo</p>' },
  { id: "b", nome: "Fixture", atalho: "PJPJ", textoExpandido: structured },
]);

async function run(name: string, initial: string, afterBvTT: boolean, middle: boolean) {
  const started = performance.now();
  const source = document.createElement("div"); source.innerHTML = initial;
  const mount = document.createElement("main"); document.body.append(mount);
  const view = new EditorView(mount, {
    state: EditorState.create({ schema, doc: DOMParser.fromSchema(schema).parse(source) }),
    handleScrollToSelection: () => true,
  });
  const selectText = (text: string) => {
    let position = -1;
    view.state.doc.descendants((node, pos) => { if (node.isText && node.text!.includes(text)) position = pos + node.text!.indexOf(text); });
    assert(position >= 0, "text position unavailable");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position, position + text.length)));
    view.focus();
  };
  try {
    if (afterBvTT) {
      selectText("BvTT"); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.to)));
      assert(await expandHubSpotMacro(view.dom, snapshot) === "expanded", "first expansion failed");
      await frame(); await frame();
      assert(window.getSelection()!.toString() === "%NOME%", "initial placeholder not selected");
      document.execCommand("insertText", false, "Lucas"); await frame(); await frame();
      selectText(middle ? "Orientações." : "Gustavo");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.to)));
      document.execCommand("insertText", false, " PJPJ"); await frame(); await frame();
    }
    selectText("PJPJ"); view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.to)));
    const prior = view.state.doc.textContent.replace("PJPJ", "");
    assert(await expandHubSpotMacro(view.dom, snapshot) === "expanded", "structured expansion failed");
    await frame(); await frame();
    const expected = document.createElement("div"); expected.innerHTML = structured;
    assert(view.state.doc.textContent.replace(expected.textContent!, "") === prior, "previous/suffix content changed");
    const list = view.dom.querySelector(":scope > ol");
    assert(list?.children.length === 3, "numbered list flattened");
    assert(view.dom.querySelector(":scope > ul ul"), "nested bullets flattened");
    assert(view.dom.querySelectorAll("li:empty").length === 0, "empty item created");
    assert(window.getSelection()!.toString() === "%DOCUMENTO%", "macro placeholder not selected");
    document.execCommand("insertText", false, "preenchido"); await frame(); await frame();
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    assert(handleHubSpotPlaceholderTab(tab, view.dom, window.getSelection()), "Tab navigation failed");
    assert(window.getSelection()!.toString() === "%PROTOCOLO%", "second placeholder not selected");
    results.push({ test: name, passed: true, durationMs: performance.now() - started });
  } catch (error) {
    results.push({ test: name, passed: false, durationMs: performance.now() - started, reason: error instanceof Error ? error.message : "unknown" });
  } finally { view.destroy(); mount.remove(); }
}

async function runImported(macros: Macro[]) {
  const realSnapshot = buildMacroSnapshot(macros);
  for (const macro of macros.filter(macro => macro.atalho !== "BvTT")) {
    const started = performance.now();
    const mount = document.createElement("main"); document.body.append(mount);
    const view = new EditorView(mount, { state: EditorState.create({ schema }), handleScrollToSelection: () => true });
    const type = async (text: string) => { document.execCommand("insertText", false, text); await frame(); await frame(); };
    try {
      view.focus(); await type("BvTT");
      assert(await expandHubSpotMacro(view.dom, realSnapshot) === "expanded", "imported welcome expansion failed");
      await frame(); await frame();
      assert(window.getSelection()!.toString() === "%NOME%", "imported welcome placeholder not selected");
      await type("Lucas");
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 1)));
      view.focus(); await type(" " + macro.atalho);
      const previousText = view.state.doc.textContent.slice(0, -macro.atalho.length);
      const expected = document.createElement("div"); expected.innerHTML = prepareHubSpotHtml(macro.textoExpandido).html;
      const expectedModel = DOMParser.fromSchema(schema).parse(expected);
      const outcome = await expandHubSpotMacro(view.dom, realSnapshot);
      const metrics = (root: Element) => ({
        paragraphs: root.querySelectorAll("p").length, breaks: root.querySelectorAll("br").length,
        ol: root.querySelectorAll("ol").length, ul: root.querySelectorAll("ul").length, li: root.querySelectorAll("li").length,
        strongCharacters: Array.from(root.querySelectorAll("strong,b")).filter(node => !node.parentElement?.closest("strong,b")).map(node => node.textContent).join("").replace(/\s/g, "").length,
        hardBreaks: Array.from(root.querySelectorAll("br")).filter(br => !br.classList.contains("ProseMirror-trailingBreak") && br.parentElement?.childNodes.length !== 1).length,
        lists: Array.from(root.querySelectorAll("ol,ul")).map(list => [list.tagName, list.getAttribute("start"), Array.from(list.children).map(node => node.tagName), list.parentElement?.tagName, list.parentElement?.tagName === "LI" ? Array.from(list.parentElement.childNodes).map(node => node.nodeName) : []]),
        textCharacters: root.textContent!.replace(/\s/g, "").length,
      });
      assert(outcome === "expanded", "imported expansion: " + JSON.stringify({ outcome, lastFailure, expected: metrics(expected), actual: metrics(view.dom) }));
      await frame(); await frame();
      assert(view.state.doc.textContent.replace(expectedModel.textContent, "") === previousText, "imported text changed");
      for (const tag of ["ol", "ul", "li", "img"]) assert(view.dom.querySelectorAll(tag).length === expected.querySelectorAll(tag).length, "imported list/image changed");
      assert(view.dom.querySelectorAll("p").length >= expected.querySelectorAll("p").length, "imported paragraphs collapsed");
      results.push({ test: "imported welcome followed by " + macro.atalho, passed: true, durationMs: performance.now() - started });
    } catch (error) { results.push({ test: "imported welcome followed by " + macro.atalho, passed: false, durationMs: performance.now() - started, reason: error instanceof Error ? error.message : "unknown" }); }
    finally { view.destroy(); mount.remove(); }
  }
}

async function runContentScript() {
  const started = performance.now();
  // The real adapter supports an about:blank composer identified by the parent
  // HubSpot origin. Simulate that frame context without contacting HubSpot.
  Object.defineProperty(document, "referrer", { configurable: true, value: "https://app.hubspot.com/" });
  let reads = 0;
  let changed: (changes: object, area: string) => void = () => {};
  Object.assign(window.chrome ?? (window.chrome = {}), {
    runtime: {},
    storage: {
      local: { get: (key: string, callback: (value: object) => void) => { reads += 1; callback({ [key]: snapshot.macros }); } },
      onChanged: { addListener: (callback: typeof changed) => { changed = callback; } },
    },
  });
  const script = document.createElement("script"); script.src = "/content.js";
  await new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = reject; document.head.append(script); });
  const mount = document.createElement("main"); document.body.append(mount);
  const source = document.createElement("div"); source.innerHTML = "<p>BvTT</p>";
  const view = new EditorView(mount, { state: EditorState.create({ schema, doc: DOMParser.fromSchema(schema).parse(source) }), handleScrollToSelection: () => true });
  const settle = async () => { for (let count = 0; count < 8; count += 1) await frame(); };
  const expand = async () => {
    view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }));
    for (let index = 0; index < 2; index += 1) {
      const event = new KeyboardEvent("keydown", { key: " ", shiftKey: true, bubbles: true, cancelable: true });
      view.dom.dispatchEvent(event); assert(event.defaultPrevented, "production shortcut was not intercepted");
    }
    await settle();
  };
  const end = () => { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 1))); view.focus(); };
  try {
    end(); await expand();
    assert(window.getSelection()!.toString() === "%NOME%", "production initial placeholder not selected");
    document.execCommand("insertText", false, "Lucas"); await settle();
    end(); document.execCommand("insertText", false, " PJPJ"); await settle(); await expand();
    assert(view.dom.querySelectorAll(":scope > ol").length === 1, "production structured content lost/duplicated");
    assert(view.dom.querySelector("ul ul"), "production hierarchy lost");
    assert(window.getSelection()!.toString() === "%DOCUMENTO%", "production structured placeholder not selected");
    document.execCommand("insertText", false, "preenchido"); await settle();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    view.dom.dispatchEvent(tab);
    assert(tab.defaultPrevented && window.getSelection()!.toString() === "%PROTOCOLO%", "production Tab navigation failed");
    document.execCommand("insertText", false, "123"); await settle();
    changed({ "lilac-keys-macros": { newValue: [{ id: "b", nome: "Updated", atalho: "PJPJ", textoExpandido: "<p>Atualizada.</p><p>Nova linha.</p>" }] } }, "local");
    end(); document.execCommand("insertText", false, " PJPJ"); await settle(); await expand();
    assert(view.state.doc.textContent.endsWith("Atualizada.Nova linha."), "production cache invalidation failed");
    assert(reads === 1, "production expanded by rereading storage");
    assert(!/[\u200b\ufeff]/.test(view.state.doc.textContent), "production technical character leaked");
    const beforeLineBreak = view.state.doc.textContent;
    document.execCommand("insertParagraph", false); await settle();
    assert(view.state.doc.textContent === beforeLineBreak, "breaking a line inserted blank characters");
    results.push({ test: "production Shift+Space, Tab, duplicate prevention and storage update", passed: true, durationMs: performance.now() - started });
  } catch (error) { results.push({ test: "production content script", passed: false, durationMs: performance.now() - started, reason: error instanceof Error ? error.message : "unknown" }); }
  finally { view.destroy(); mount.remove(); }
}

void (async () => {
  await run("PJPJ alone", "<p>PJPJ</p>", false, false);
  await run("BvTT + replacement + PJPJ at end", "<p>BvTT</p>", true, false);
  await run("BvTT + PJPJ before signature", "<p>BvTT</p>", true, true);
  await run("inside strong with suffix", "<p><strong>Antes PJPJ Depois</strong></p>", false, false);
  await run("inside previous list", "<ul><li><p>Antes PJPJ</p></li><li><p>Depois</p></li></ul>", false, false);
  const imported = await (await fetch("/macros.json")).json() as Macro[] | null;
  if (imported) await runImported(imported);
  await runContentScript();
  const report = document.createElement("pre"); report.id = "result"; report.textContent = JSON.stringify(results);
  document.body.append(report);
  await fetch("/result", { method: "POST", body: JSON.stringify(results) });
})();
