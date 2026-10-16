import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { Folder, Macro } from "../src/types/macro.ts";

const compilation = await build({
  stdin: {
    contents: `
      import React, {act, useState} from "react";
      import {createRoot} from "react-dom/client";
      import {FolderTreePicker} from "./src/components/FolderTreePicker/FolderTreePicker";
      import {MacroForm} from "./src/components/MacroForm/MacroForm";
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const root = createRoot(document.getElementById("app"));
      function Picker(props) {
        const [value, setValue] = useState(props.value ?? "");
        return <FolderTreePicker {...props} value={value} onChange={id => {
          setValue(id); props.onChange(id);
        }}/>;
      }
      window.harness = {
        picker: props => act(() => root.render(<Picker {...props}/>)),
        form: props => act(() => root.render(<MacroForm {...props}/>)),
        focus: element => act(() => element.focus()),
        dispatch: (element, event) => act(() => element.dispatchEvent(event)),
        unmount: () => act(() => root.unmount())
      };
    `,
    loader: "tsx", resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  plugins: [{ name: "omit-css", setup(build) {
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "text" }));
  } }],
});

interface Harness {
  picker(props: object): void;
  form(props: object): void;
  focus(element: HTMLElement): void;
  dispatch(element: Element, event: Event): void;
  unmount(): void;
}

const folders: Folder[] = [
  { id: "ticket", name: "TICKET", createdAt: 1 },
  { id: "edu", name: "🟦 MYEDUZZ", parentId: "ticket", createdAt: 2 },
  { id: "docs", name: "Validação", parentId: "edu", createdAt: 3 },
  { id: "external", name: "EXTERNO", createdAt: 4 },
  { id: "other", name: "🟦 MYEDUZZ", parentId: "external", createdAt: 5 },
];
const html = '<p>Olá <strong>%NOME%</strong>!</p><p><em>Ação</em> e acentos 🫡</p><ul><li>Item</li></ul>';
const macro: Macro = { id: "macro", nome: "Saudação", atalho: "bv", textoExpandido: html, folderId: "edu" };

function setup() {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: "https://lilac-keys.test", runScripts: "outside-only", pretendToBeVisual: true,
  });
  dom.window.eval(compilation.outputFiles[0].text);
  const harness = (dom.window as unknown as { harness: Harness }).harness;
  const document = dom.window.document;
  const selected: string[] = [];
  const saved: Omit<Macro, "id">[] = [];
  let cancellations = 0;
  const formProps = {
    folders, onSubmit: (value: Omit<Macro, "id">) => { saved.push(value); return { success: true }; },
    onCancel: () => { cancellations += 1; },
  };
  const form = (value?: Macro) => harness.form({ ...formProps, macro: value });
  const picker = (value = "edu", items = folders) => harness.picker({ folders: items, value, onChange: (id: string) => selected.push(id) });
  const input = () => document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  const type = (element: HTMLInputElement, value: string) => {
    harness.focus(element);
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
    harness.dispatch(element, new dom.window.Event("input", { bubbles: true }));
  };
  const click = (element: HTMLElement) => {
    const down = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    harness.dispatch(element, down);
    if (!down.defaultPrevented) harness.focus(element);
    harness.dispatch(element, new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  };
  const key = (element: Element, value: string, modifiers: KeyboardEventInit = {}) => {
    const event = new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...modifiers });
    harness.dispatch(element, event);
    return event;
  };
  const options = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-label="Resultados de pastas"] [role="option"]'));
  const close = () => { harness.unmount(); dom.window.close(); };
  return { dom, document, harness, selected, saved, form, picker, input, type, click, key, options, close, cancellations: () => cancellations };
}

test("busca mostra caminhos homônimos, seleciona por ID e sincroniza a árvore aninhada", () => {
  const ui = setup();
  try {
    ui.picker();
    assert.equal(ui.document.getElementById("folderId")!.firstElementChild!.textContent?.trim(), "🟦 MYEDUZZ");
    ui.type(ui.input(), "myeduzz 🟦");
    assert.equal(ui.input().getAttribute("aria-expanded"), "true");
    assert.equal(ui.options().length, 3);
    assert.ok(ui.options()[0].textContent?.includes("TICKET / 🟦 MYEDUZZ"));
    assert.ok(ui.options()[1].textContent?.includes("EXTERNO / 🟦 MYEDUZZ"));
    assert.equal(ui.options()[0].getAttribute("aria-selected"), "true");
    ui.click(ui.options()[1]);
    assert.deepEqual(ui.selected, ["other"]);
    assert.equal(ui.input().value, "");
    assert.equal(ui.document.activeElement, ui.input());
    assert.equal(ui.input().getAttribute("aria-expanded"), "false");
    assert.equal(ui.document.getElementById("folderId")!.firstElementChild!.textContent?.trim(), "🟦 MYEDUZZ");
    ui.click(ui.document.getElementById("folderId")!);
    const treeSelection = ui.document.querySelector('[aria-label="Árvore de pastas"] [aria-selected="true"]');
    assert.ok(treeSelection?.textContent?.includes("🟦 MYEDUZZ"));
    ui.click(treeSelection as HTMLButtonElement);
    assert.deepEqual(ui.selected, ["other", "other"]);
  } finally { ui.close(); }
});

test("teclado percorre resultados, Enter seleciona e Tab conserva a navegação natural", () => {
  const ui = setup();
  try {
    ui.picker();
    ui.type(ui.input(), "MYEDUZZ");
    assert.equal(ui.input().getAttribute("aria-activedescendant"), ui.options()[0].id);
    ui.key(ui.input(), "ArrowDown");
    assert.equal(ui.input().getAttribute("aria-activedescendant"), ui.options()[1].id);
    ui.key(ui.input(), "ArrowUp");
    assert.equal(ui.input().getAttribute("aria-activedescendant"), ui.options()[0].id);
    ui.key(ui.input(), "Enter");
    assert.deepEqual(ui.selected, ["edu"]);
    ui.type(ui.input(), "validacao");
    const tab = ui.key(ui.input(), "Tab");
    assert.equal(tab.defaultPrevented, false);
    assert.equal(ui.input().getAttribute("aria-expanded"), "false");
    // JSDOM does not execute native Tab focus movement; the next control remains reachable.
    ui.harness.focus(ui.document.getElementById("folderId")!);
    assert.equal(ui.document.activeElement?.id, "folderId");
    assert.deepEqual(ui.selected, ["edu"]);
  } finally { ui.close(); }
});

test("sem resultados e Escape preservam a associação; Sem pasta exige escolha explícita", () => {
  const ui = setup();
  try {
    ui.picker();
    ui.type(ui.input(), "inexistente");
    assert.ok(ui.document.querySelector(".macro-form-folder-search-empty"));
    assert.ok(ui.document.querySelector('[role="status"]')!.textContent?.includes("0 pasta(s)"));
    ui.key(ui.input(), "Enter");
    assert.deepEqual(ui.selected, []);
    ui.key(ui.input(), "Escape");
    assert.equal(ui.input().getAttribute("aria-expanded"), "false");
    assert.equal(ui.document.activeElement, ui.input());
    assert.deepEqual(ui.selected, []);
    ui.key(ui.input(), "ArrowDown");
    ui.key(ui.input(), "Enter");
    assert.deepEqual(ui.selected, [""]);
    assert.ok(ui.document.getElementById("folderId")!.textContent?.includes("Sem pasta"));
  } finally { ui.close(); }
});

test("árvore continua expandindo e recolhendo pastas e oferecendo Sem pasta", () => {
  const ui = setup();
  try {
    ui.picker("");
    const trigger = ui.document.getElementById("folderId")!;
    ui.click(trigger);
    assert.equal(ui.document.querySelectorAll('[aria-label="Árvore de pastas"] [role="option"]').length, 3);
    ui.click(ui.document.querySelector<HTMLButtonElement>('[aria-label="Expandir TICKET"]')!);
    assert.equal(ui.document.querySelectorAll('[aria-label="Árvore de pastas"] [role="option"]').length, 4);
    ui.click(ui.document.querySelector<HTMLButtonElement>('[aria-label="Recolher TICKET"]')!);
    assert.equal(ui.document.querySelectorAll('[aria-label="Árvore de pastas"] [role="option"]').length, 3);
    ui.key(trigger, "Escape");
    assert.equal(ui.document.querySelector('[aria-label="Árvore de pastas"]'), null);
    ui.click(trigger);
    ui.click(ui.document.querySelector<HTMLButtonElement>('[aria-label="Árvore de pastas"] [role="option"]')!);
    assert.deepEqual(ui.selected, [""]);
  } finally { ui.close(); }
});

test("edição salva a nova pasta e reabre preservando HTML e placeholders", () => {
  const ui = setup();
  try {
    ui.form(macro);
    assert.equal(ui.document.getElementById("textoExpandido")!.innerHTML, html);
    ui.type(ui.input(), "validação");
    ui.key(ui.input(), "Enter");
    assert.equal(ui.saved.length, 0);
    ui.key(ui.input(), "Enter", { ctrlKey: true });
    assert.deepEqual(JSON.parse(JSON.stringify(ui.saved[0])), {
      nome: macro.nome, atalho: macro.atalho, textoExpandido: html, folderId: "docs",
    });
    const reloaded: Macro = { id: macro.id, ...JSON.parse(JSON.stringify(ui.saved[0])) };
    ui.form(reloaded);
    assert.equal(ui.document.getElementById("folderId")!.firstElementChild!.textContent?.trim(), "Validação");
    assert.equal(ui.document.getElementById("textoExpandido")!.innerHTML, html);
    ui.type(ui.input(), "MYEDUZZ");
    ui.click(ui.options().at(-1)!);
    ui.key(ui.input(), "Enter", { metaKey: true });
    assert.equal(ui.saved[1].folderId, undefined);
    assert.equal(ui.saved[1].textoExpandido, html);
  } finally { ui.close(); }
});

test("criação permite escolher pasta sem alterar o conteúdo digitado no RichTextEditor", () => {
  const ui = setup();
  try {
    ui.form();
    ui.type(ui.document.getElementById("nome") as HTMLInputElement, "Nova macro");
    ui.type(ui.document.getElementById("atalho") as HTMLInputElement, "nova");
    const editor = ui.document.getElementById("textoExpandido")!;
    editor.innerHTML = html;
    ui.harness.dispatch(editor, new ui.dom.window.Event("input", { bubbles: true }));
    ui.type(ui.input(), "🟦");
    ui.click(ui.options()[0]);
    ui.key(ui.input(), "Enter", { ctrlKey: true });
    assert.deepEqual(JSON.parse(JSON.stringify(ui.saved[0])), {
      nome: "Nova macro", atalho: "nova", textoExpandido: html, folderId: "edu",
    });
  } finally { ui.close(); }
});

test("Ctrl/Command + Enter salva a associação atual mesmo com a pesquisa aberta", () => {
  const ui = setup();
  try {
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
      ui.form({ ...macro });
      ui.type(ui.input(), "validação");
      ui.key(ui.input(), "Enter", modifiers);
      assert.equal(ui.saved.at(-1)!.folderId, "edu");
      assert.equal(ui.saved.at(-1)!.textoExpandido, html);
    }
    assert.equal(ui.saved.length, 2);
  } finally { ui.close(); }
});

test("Escape fecha primeiro os resultados; pesquisar não cria alteração não salva", () => {
  const ui = setup();
  try {
    ui.form(macro);
    ui.type(ui.input(), "myeduzz");
    ui.key(ui.input(), "Escape");
    assert.equal(ui.cancellations(), 0);
    assert.equal(ui.document.querySelector(".macro-form-exit-confirmation"), null);
    ui.key(ui.input(), "Escape");
    assert.equal(ui.cancellations(), 1);
    assert.equal(ui.saved.length, 0);
  } finally { ui.close(); }
});

test("troca de folderId participa da confirmação de saída e pode ser descartada", () => {
  const ui = setup();
  try {
    ui.form(macro);
    ui.type(ui.input(), "validação");
    ui.key(ui.input(), "Enter");
    ui.key(ui.input(), "Escape");
    const confirmation = ui.document.querySelector(".macro-form-exit-confirmation")!;
    assert.ok(confirmation);
    assert.equal(ui.cancellations(), 0);
    assert.equal(ui.saved.length, 0);
    const discard = Array.from(confirmation.querySelectorAll("button")).find(button => button.textContent?.includes("Sair sem salvar"))!;
    ui.click(discard);
    assert.equal(ui.cancellations(), 1);
    assert.equal(ui.saved.length, 0);
    assert.equal(macro.folderId, "edu");
  } finally { ui.close(); }
});

test("sair da busca fecha a lista sem persistir, mesmo sem nenhuma pasta cadastrada", () => {
  const ui = setup();
  try {
    ui.picker("", []);
    ui.type(ui.input(), "qualquer");
    assert.equal(ui.options().length, 1);
    // Move focus outside the picker to model clicking another form control.
    const outside = ui.document.createElement("button");
    ui.document.body.append(outside);
    ui.harness.focus(outside);
    assert.equal(ui.input().getAttribute("aria-expanded"), "false");
    assert.deepEqual(ui.selected, []);
    assert.equal(ui.saved.length, 0);
  } finally { ui.close(); }
});
