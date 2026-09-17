import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Compile the actual content-script entry in memory. No generated file or ZIP.
const compilation = await build({
  entryPoints: ["src/content/content.ts"], bundle: true, write: false,
  format: "iife", platform: "browser", target: "es2021",
});
const code = compilation.outputFiles[0].text;

test("content script conserva o fluxo genérico e atualização do cache fora do HubSpot", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div contenteditable="true" tabindex="0">Antes CODE Depois</div></body></html>', {
    url: "https://example.test/", pretendToBeVisual: true, runScripts: "outside-only",
  });
  const { window } = dom;
  const editor = window.document.querySelector("div")!;
  let reads = 0;
  let changed!: (changes: object, area: string) => void;
  const firstHtml = '<p>Olá <strong>%NOME%</strong></p><ul><li>Item</li></ul>';
  window.chrome = {
    runtime: {},
    storage: {
      onChanged: { addListener: (listener) => { changed = listener; } },
      local: { get: (key, callback) => {
        reads += 1;
        callback({ [key]: [{ id: "x", nome: "Fixture", atalho: "CODE", textoExpandido: firstHtml }] });
      } },
    },
  };
  const commands: string[] = [];
  let pastes = 0;
  editor.addEventListener("paste", () => { pastes += 1; });
  Object.defineProperty(editor, "isContentEditable", { value: true });
  const selection = window.getSelection()!;
  Object.defineProperty(selection, "modify", { value: () => {
    const range = selection.getRangeAt(0);
    range.setStart(range.startContainer, range.startOffset - 1);
  } });
  Object.defineProperty(window.document, "execCommand", { value: (command: string, _ui: boolean, html: string) => {
    commands.push(command);
    const range = selection.getRangeAt(0);
    const fragment = range.createContextualFragment(html);
    const last = fragment.lastChild!;
    range.deleteContents(); range.insertNode(fragment);
    range.setStartAfter(last); range.collapse(true);
    return true;
  } });
  try {
    window.eval(code);
    const expand = async () => {
      editor.focus();
      const range = window.document.createRange();
      range.setStart(editor.firstChild!, 10); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      editor.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", shiftKey: true, bubbles: true, cancelable: true }));
      await new Promise(resolve => window.setTimeout(resolve, 0));
    };
    await expand();
    assert.equal(selection.toString(), "%NOME%");
    assert.equal(editor.querySelector("ul li")?.textContent, "Item");
    assert.equal(editor.textContent, "Antes Olá %NOME%Item Depois");
    assert.deepEqual(commands, ["insertHTML"]);
    assert.equal(pastes, 0);
    assert.equal(reads, 1);

    changed({ "lilac-keys-macros": { newValue: [{ id: "x", nome: "Fixture", atalho: "CODE", textoExpandido: "<p>Atualizada</p>" }] } }, "local");
    editor.textContent = "Antes CODE Depois";
    await expand();
    assert.equal(editor.textContent, "Antes Atualizada Depois");
    assert.equal(reads, 1);
    assert.equal(pastes, 0);
  } finally { window.close(); }
});
