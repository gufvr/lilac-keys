import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const compilation = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {flushSync} from "react-dom";
      import {MacroList} from "./src/components/MacroList/MacroList";
      import {ImportExport} from "./src/components/ImportExport/ImportExport";
      const root = createRoot(document.getElementById("app"));
      window.harness = {
        mount: props => flushSync(() => root.render(<MacroList {...props}/>)),
        preview: props => flushSync(() => root.render(<ImportExport {...props}/>)),
        dispatch: (target, event) => flushSync(() => target.dispatchEvent(event)),
        unmount: () => flushSync(() => root.unmount())
      };
    `,
    loader: "tsx", resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  // CSS is verified by the production build; DOM tests exercise the real components.
  plugins: [{ name: "omit-css", setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "text" }));
  } }],
});

interface Harness {
  mount(props: object): void;
  preview(props: object): void;
  dispatch(target: Element, event: Event): void;
  unmount(): void;
}

function setup() {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "https://lilac-keys.test", runScripts: "outside-only", pretendToBeVisual: true,
  });
  dom.window.eval(compilation.outputFiles[0].text);
  const harness = (dom.window as unknown as { harness: Harness }).harness;
  const exports: unknown[][] = [];
  const props = {
    macros: [
      { id: "a", nome: "Alpha", atalho: "a", textoExpandido: "<p>A</p>" },
      { id: "b", nome: "Beta", atalho: "b", textoExpandido: "<p>B</p>" },
      { id: "c", nome: "Gamma", atalho: "c", textoExpandido: "<p>C</p>" },
    ],
    folders: [{ id: "f", name: "Folder", createdAt: 1 }], query: "",
    onQueryChange() {}, onFolderChange() {}, onGoHome() {}, onCreateMacro() {},
    onEdit() {}, onClone() {}, onDelete() {}, onCreateFolder() {}, onDeleteSelected() {},
    onMoveMacros: () => ({ success: true }), onRenameFolder: () => ({ success: true }),
    onMoveFolder: () => ({ success: true }), onMoveFolders: () => ({ success: true }),
    onDeleteFolder() {}, onDeleteFolders() {}, onCloneFolder: () => ({ success: true, adjustedShortcuts: 0 }),
    onExport: (...args: unknown[]) => exports.push(args),
    onExportFolder: (...args: unknown[]) => exports.push(["folder", ...args]),
  };
  harness.mount(props);
  const document = dom.window.document;
  const click = (target: Element) => harness.dispatch(target, new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  const button = (label: string) => {
    const item = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    assert.ok(item, label);
    return item;
  };
  const key = (target: Element, value: string, shiftKey = false) => harness.dispatch(target,
    new dom.window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }));
  const close = () => { harness.unmount(); dom.window.close(); };
  return { dom, document, harness, exports, props, click, button, key, close };
}

for (const format of ["JSON", "TXT"]) {
  for (const includeFolders of [false, true]) {
    test(`${format}: card aguarda escolha, isola eventos e exporta escopo ${includeFolders}`, () => {
      const ui = setup();
      try {
        const trigger = ui.button(`Exportar macro Alpha em ${format}`);
        const card = trigger.closest(".macro-card")!;
        ui.click(trigger);
        assert.equal(ui.exports.length, 0);
        const panel = ui.document.querySelector<HTMLElement>("[role=dialog]")!;
        assert.ok(panel.textContent?.includes(`Exportar ${format}`));
        const options = panel.querySelectorAll("button");
        assert.equal(ui.document.activeElement, options[0]);
        assert.equal(trigger.getAttribute("aria-expanded"), "true");
        assert.equal(card.classList.contains("is-expanded"), false);
        assert.equal(ui.document.querySelector<HTMLInputElement>('input[aria-label="Selecionar Alpha"]')!.checked, false);
        let bubbled = 0;
        const record = () => { bubbled += 1; };
        ui.document.addEventListener("pointerdown", record);
        ui.harness.dispatch(options[0], new ui.dom.window.Event("pointerdown", { bubbles: true }));
        ui.document.removeEventListener("pointerdown", record);
        assert.equal(bubbled, 0);
        const drag = new ui.dom.window.Event("dragstart", { bubbles: true, cancelable: true });
        ui.harness.dispatch(panel, drag);
        assert.equal(drag.defaultPrevented, true);
        ui.click(options[includeFolders ? 1 : 0]);
        assert.deepEqual(JSON.parse(JSON.stringify(ui.exports)), [[["a"], format.toLowerCase(), includeFolders]]);
        assert.equal(ui.document.querySelector("[role=dialog]"), null);
        assert.equal(ui.document.activeElement, trigger);
      } finally { ui.close(); }
    });
  }
}

test("seleção múltipla é usada somente se o card acionado estiver selecionado", () => {
  const ui = setup();
  try {
    ui.click(ui.document.querySelector('input[aria-label="Selecionar Alpha"]')!);
    ui.click(ui.document.querySelector('input[aria-label="Selecionar Beta"]')!);
    ui.click(ui.button("Exportar macro Alpha em JSON"));
    ui.click(ui.document.querySelector('[role=dialog] button')!);
    assert.deepEqual(JSON.parse(JSON.stringify(ui.exports[0])), [["a", "b"], "json", false]);
    ui.click(ui.button("Exportar macro Gamma em TXT"));
    ui.click(ui.document.querySelector('[role=dialog] button')!);
    assert.deepEqual(JSON.parse(JSON.stringify(ui.exports[1])), [["c"], "txt", false]);
    assert.equal(ui.document.querySelector<HTMLInputElement>('input[aria-label="Selecionar Alpha"]')!.checked, true);
    assert.equal(ui.document.querySelector<HTMLInputElement>('input[aria-label="Selecionar Beta"]')!.checked, true);
  } finally { ui.close(); }
});

test("Cancelar, Escape e clique externo fecham sem download e devolvem o foco", () => {
  const ui = setup();
  try {
    const trigger = ui.button("Exportar macro Alpha em JSON");
    for (const method of ["cancel", "escape", "outside"]) {
      ui.click(trigger);
      const panel = ui.document.querySelector<HTMLElement>("[role=dialog]")!;
      if (method === "cancel") ui.click(panel.querySelectorAll("button")[2]);
      if (method === "escape") ui.key(panel.querySelector("button")!, "Escape");
      if (method === "outside") ui.harness.dispatch(ui.document.body, new ui.dom.window.Event("pointerdown", { bubbles: true }));
      assert.equal(ui.document.querySelector("[role=dialog]"), null);
      assert.equal(ui.document.activeElement, trigger);
      assert.equal(ui.exports.length, 0);
    }
    ui.click(trigger);
    const options = ui.document.querySelectorAll<HTMLButtonElement>("[role=dialog] button");
    ui.key(options[0], "Tab", true);
    assert.equal(ui.document.activeElement, options[2]);
    ui.key(options[2], "Tab");
    assert.equal(ui.document.activeElement, options[0]);
  } finally { ui.close(); }
});

test("ação direta de pasta continua exportando imediatamente", () => {
  const ui = setup();
  try {
    ui.click(ui.button("Exportar pasta Folder em JSON"));
    assert.deepEqual(JSON.parse(JSON.stringify(ui.exports)), [["folder", "f", "json"]]);
    assert.equal(ui.document.querySelector("[role=dialog]"), null);
  } finally { ui.close(); }
});

test("prévia distingue raiz e caminho de pasta; cancelar não chama persistência", async () => {
  const ui = setup();
  let imports = 0;
  try {
    ui.harness.preview({ macros: [], folders: [], onImport: () => { imports += 1; } });
    for (const withFolders of [false, true]) {
      const payload = {
        format: "lilac-keys", version: 2,
        macros: [{ id: "a", nome: "Alpha", atalho: "a", textoExpandido: "<p>%NOME%</p>",
          ...(withFolders ? { folderId: "f" } : {}) }],
        folders: withFolders ? [{ id: "f", name: "Folder", createdAt: 1 }] : [],
      };
      const input = ui.document.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new ui.dom.window.File([JSON.stringify(payload)], "snippets.json", { type: "application/json" });
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      ui.harness.dispatch(input, new ui.dom.window.Event("change", { bubbles: true }));
      for (let attempt = 0; attempt < 50 && !ui.document.querySelector(".import-preview"); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      const preview = ui.document.querySelector(".import-preview");
      assert.ok(preview);
      assert.ok(preview.textContent?.includes(`Pasta: ${withFolders ? "Folder" : "Raiz"}`));
      assert.equal(imports, 0);
      const cancel = Array.from(preview.querySelectorAll("button")).find(button => button.textContent === "Cancelar")!;
      ui.click(cancel);
      assert.equal(ui.document.querySelector(".import-preview"), null);
      assert.equal(imports, 0);
    }
  } finally { ui.close(); }
});
