import assert from "node:assert/strict";
import test from "node:test";

import type { Folder, Macro } from "../src/types/macro.ts";
import { cloneFolderTree } from "../src/utils/folderClone.ts";
import { sortItemsByOrder } from "../src/utils/itemOrdering.ts";

const folders: Folder[] = [
  { id: "before", name: "Antes", createdAt: 1, order: 0 },
  { id: "source", name: "Clientes", createdAt: 2, order: 1 },
  { id: "nested", name: "Ativos", createdAt: 3, parentId: "source", order: 0 },
  { id: "after", name: "Depois", createdAt: 4, order: 2 },
];
const macros: Macro[] = [
  {
    id: "one",
    nome: "Boas-vindas",
    atalho: "bv",
    textoExpandido: "<p>Olá %NOME%</p>",
    folderId: "source",
    order: 0,
  },
  {
    id: "two",
    nome: "Documento",
    atalho: "doc",
    textoExpandido: '<p>Documento</p><img src="data:image/png;base64,abc">',
    folderId: "nested",
    order: 0,
  },
];

test("clona pasta, subpastas e macros com ids e atalhos novos", () => {
  let id = 0;
  const result = cloneFolderTree(folders, macros, "source", {
    createId: () => `new-${++id}`,
    now: () => 100,
  });
  assert.equal(result.success, true);
  assert.equal(result.adjustedShortcuts, 2);
  const clonedRoot = result.folders.find((folder) => folder.id === result.clonedFolderId)!;
  const clonedChild = result.folders.find((folder) => folder.parentId === clonedRoot.id)!;
  assert.equal(clonedRoot.name, "Clientes (cópia)");
  assert.equal(clonedChild.name, "Ativos");
  const copiedMacros = result.macros.filter((macro) => macro.id.startsWith("new-"));
  assert.deepEqual(copiedMacros.map((macro) => macro.atalho), ["bv-copia", "doc-copia"]);
  assert.equal(copiedMacros[0].folderId, clonedRoot.id);
  assert.equal(copiedMacros[1].folderId, clonedChild.id);
  assert.equal(copiedMacros[0].textoExpandido, macros[0].textoExpandido);
  assert.equal(copiedMacros[1].textoExpandido, macros[1].textoExpandido);
});

test("posiciona a cópia após a original sem alterar a ordem relativa restante", () => {
  let id = 0;
  const result = cloneFolderTree(folders, macros, "source", {
    createId: () => `copy-${++id}`,
    now: () => 100,
  });
  const roots = sortItemsByOrder(
    result.folders.filter((folder) => !folder.parentId),
  );
  assert.deepEqual(roots.map((folder) => folder.name), [
    "Antes",
    "Clientes",
    "Clientes (cópia)",
    "Depois",
  ]);
});

test("incrementa nomes e atalhos quando já existem cópias", () => {
  const existingFolders = [
    ...folders,
    { id: "old-copy", name: "Clientes (cópia)", createdAt: 5, order: 3 },
  ];
  const existingMacros = [
    ...macros,
    { ...macros[0], id: "copy", atalho: "bv-copia" },
  ];
  let id = 0;
  const result = cloneFolderTree(existingFolders, existingMacros, "source", {
    createId: () => `copy-${++id}`,
    now: () => 100,
  });
  const clonedRoot = result.folders.find((folder) => folder.id === result.clonedFolderId)!;
  const clonedMacro = result.macros.find(
    (macro) => macro.folderId === clonedRoot.id,
  )!;
  assert.equal(clonedRoot.name, "Clientes (cópia 2)");
  assert.equal(clonedMacro.atalho, "bv-copia-2");
});

test("não altera os arrays quando a pasta não existe", () => {
  const result = cloneFolderTree(folders, macros, "missing");
  assert.equal(result.success, false);
  assert.equal(result.folders, folders);
  assert.equal(result.macros, macros);
});
