import assert from "node:assert/strict";
import test from "node:test";

import type { Folder, Macro } from "../src/types/macro.ts";
import {
  filterImportedData,
  getFolderPath,
  getImportMacroConflicts,
  parseImportedContent,
  resolveExportData,
  serializeExportData,
} from "../src/utils/exportImport.ts";

const folders: Folder[] = [
  { id: "root", name: "Raiz", createdAt: 1, order: 0 },
  { id: "selected", name: "Selecionada", createdAt: 2, parentId: "root", order: 0 },
  { id: "child", name: "Descendente", createdAt: 3, parentId: "selected", order: 0 },
  { id: "sibling", name: "Irmã", createdAt: 4, parentId: "root", order: 1 },
];

const macros: Macro[] = [
  {
    id: "one",
    nome: "Uma",
    atalho: "uma",
    textoExpandido: '<p>Olá %NOME%</p><img src="data:image/png;base64,abc">',
    folderId: "selected",
    order: 2,
  },
  {
    id: "child-macro",
    nome: "Filha",
    atalho: "filha",
    textoExpandido: "<p>Filha</p>",
    folderId: "child",
  },
  {
    id: "sibling-macro",
    nome: "Irmã",
    atalho: "irma",
    textoExpandido: "<p>Irmã</p>",
    folderId: "sibling",
  },
  {
    id: "root-macro",
    nome: "Sem pasta",
    atalho: "root",
    textoExpandido: "texto",
  },
];

test("exporta uma macro com somente seus ancestrais", () => {
  const result = resolveExportData(macros, folders, {
    kind: "macros",
    macroIds: ["one"],
  });
  assert.deepEqual(result.macros.map((macro) => macro.id), ["one"]);
  assert.deepEqual(result.folders.map((folder) => folder.id), ["root", "selected"]);
  assert.equal(result.macros[0].textoExpandido, macros[0].textoExpandido);
  assert.equal(result.macros[0].order, 2);
});

test("exporta múltiplas macros sem irmãs ou descendentes não selecionados", () => {
  const result = resolveExportData(macros, folders, {
    kind: "macros",
    macroIds: ["one", "root-macro"],
  });
  assert.deepEqual(result.macros.map((macro) => macro.id), ["one", "root-macro"]);
  assert.deepEqual(result.folders.map((folder) => folder.id), ["root", "selected"]);
});

test("exporta pasta completa com descendentes e sem pasta irmã", () => {
  const result = resolveExportData(macros, folders, {
    kind: "folder",
    folderId: "selected",
  });
  assert.deepEqual(result.folders.map((folder) => folder.id), ["selected", "child"]);
  assert.deepEqual(result.macros.map((macro) => macro.id), ["one", "child-macro"]);
  const payload = JSON.parse(serializeExportData(result, "json"));
  assert.equal(payload.folders[0].parentId, undefined);
});

test("exportação global mantém todas as macros e pastas", () => {
  const result = resolveExportData(macros, folders, { kind: "all" });
  assert.equal(result.macros.length, macros.length);
  assert.equal(result.folders.length, folders.length);
});

test("JSON mantém HTML, imagens, placeholders, pasta e ordem", () => {
  const selected = resolveExportData(macros, folders, {
    kind: "macros",
    macroIds: ["one"],
  });
  const payload = JSON.parse(serializeExportData(selected, "json"));
  assert.equal(payload.version, 2);
  assert.equal(payload.macros[0].textoExpandido, macros[0].textoExpandido);
  assert.equal(payload.macros[0].folderId, "selected");
  assert.equal(payload.macros[0].order, 2);
});

test("TXT selecionado reconstrói a árvore mínima e a ordem", () => {
  const selected = resolveExportData(macros, folders, {
    kind: "macros",
    macroIds: ["one"],
  });
  const parsed = parseImportedContent(serializeExportData(selected, "txt"), "macros.txt");
  assert.equal(parsed.macros.length, 1);
  assert.equal(parsed.folders.length, 2);
  assert.equal(getFolderPath(parsed.macros[0].folderId, parsed.folders), "Raiz / Selecionada");
  assert.equal(parsed.macros[0].textoExpandido, macros[0].textoExpandido);
  assert.equal(parsed.macros[0].order, 0);
});

test("TXT preserva linhas que se parecem com marcadores de pasta ou macro", () => {
  const markerBody =
    "Primeira linha\n[Pasta aparente]\n{atalho aparente}\n</macro-content>\n\\barra\nÚltima linha";
  const text = serializeExportData(
    {
      macros: [{ ...macros[0], textoExpandido: markerBody }],
      folders: folders.filter((folder) => ["root", "selected"].includes(folder.id)),
    },
    "txt",
  );
  const parsed = parseImportedContent(text, "marcadores.txt");
  assert.equal(parsed.macros[0].textoExpandido, markerBody);
  assert.equal(parsed.folders.length, 2);
});

test("mantém compatibilidade com JSON legado em array", () => {
  const parsed = parseImportedContent(
    JSON.stringify([
      { nome: "Legada", atalho: "leg", textoExpandido: "<p>Texto</p>" },
    ]),
    "legado.json",
  );
  assert.equal(parsed.macros.length, 1);
  assert.equal(parsed.macros[0].nome, "Legada");
  assert.ok(parsed.macros[0].id);
});

test("mantém compatibilidade com TXT legado sem delimitador de conteúdo", () => {
  const parsed = parseImportedContent(
    "[Legadas]\n  {leg}\n  <macro-name>Legada</macro-name>\n<p>Texto legado</p>",
    "legado.txt",
  );
  assert.equal(parsed.macros.length, 1);
  assert.equal(parsed.macros[0].textoExpandido, "<p>Texto legado</p>");
  assert.equal(getFolderPath(parsed.macros[0].folderId, parsed.folders), "Legadas");
});

test("filtra a importação sem manter descendentes ou macros não selecionadas", () => {
  const result = filterImportedData({ macros, folders }, ["one"]);
  assert.deepEqual(result.macros.map((macro) => macro.id), ["one"]);
  assert.deepEqual(result.folders.map((folder) => folder.id), ["root", "selected"]);
});

test("identifica conflitos de nome e atalho inclusive dentro do arquivo", () => {
  const imported = [
    { ...macros[0], id: "a", nome: "Existente", atalho: "novo" },
    { ...macros[0], id: "b", nome: "Outra", atalho: "novo" },
  ];
  const existing = [
    { ...macros[0], id: "existing", nome: "Existente", atalho: "existente" },
  ];
  const conflicts = getImportMacroConflicts(imported, existing);
  assert.deepEqual(conflicts.get("a"), { name: true, shortcut: false });
  assert.deepEqual(conflicts.get("b"), { name: false, shortcut: true });
});
