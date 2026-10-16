import assert from "node:assert/strict";
import test from "node:test";
import type { Folder } from "../src/types/macro.ts";
import { normalizeFolderSearch, searchFolders } from "../src/utils/folderSearch.ts";

const folders: Folder[] = [
  { id: "ticket", name: "TICKET", createdAt: 1, order: 1 },
  { id: "external", name: "EXTERNO", createdAt: 2, order: 0 },
  { id: "edu", name: "🟦 MYEDUZZ", parentId: "ticket", createdAt: 3 },
  { id: "other", name: "🟦 MYEDUZZ", parentId: "external", createdAt: 4 },
  { id: "docs", name: "Validação   de Documentação", parentId: "edu", createdAt: 5 },
  { id: "plain", name: "Produtos", createdAt: 6, order: 2 },
];

test("busca parcial ignora caixa, acentos e espaços sem alterar os nomes", () => {
  const original = structuredClone(folders);
  assert.equal(normalizeFolderSearch("  VÁLIDAÇÃO  \n de  "), "validacao de");
  for (const query of ["Validação de Documentação", "validacao de documentacao", "  VALIDAÇÃO   DOCUM  ", "docu"]) {
    assert.deepEqual(searchFolders(folders, query).map(({ folder }) => folder.id), ["docs"]);
  }
  assert.deepEqual(searchFolders(folders, "PROD").map(({ folder }) => folder.id), ["plain"]);
  assert.deepEqual(folders, original);
});

test("emoji é encontrado sozinho ou junto do nome em qualquer posição", () => {
  for (const query of ["MYEDUZZ", "myeduzz", "🟦 MYEDUZZ", "MYEDUZZ 🟦", "🟦", "myE", "MYEDUZZ🟦"]) {
    assert.deepEqual(searchFolders(folders, query).map(({ folder }) => folder.id), ["other", "edu"], query);
  }
  assert.equal(searchFolders(folders, "🟥").length, 0);
  assert.equal(searchFolders(folders, "inexistente").length, 0);
});

test("resultados homônimos preservam a ordem da árvore e identificam o caminho completo", () => {
  const result = searchFolders(folders, "myeduzz");
  assert.deepEqual(result.map(({ path }) => path), ["EXTERNO / 🟦 MYEDUZZ", "TICKET / 🟦 MYEDUZZ"]);
  assert.deepEqual(searchFolders(folders, "documentacao")[0].ancestorIds, ["ticket", "edu"]);
  assert.equal(searchFolders(folders, "documentacao")[0].level, 2);
  assert.deepEqual(searchFolders(folders).map(({ folder }) => folder.id), ["external", "other", "ticket", "edu", "docs", "plain"]);
});

test("símbolos Unicode mantêm a identidade e ignoram apenas a variação de apresentação", () => {
  const symbols: Folder[] = [{ id: "symbol", name: "📚 Atenção ☎️", createdAt: 1 }];
  assert.equal(searchFolders(symbols, "atencao ☎").length, 1);
  assert.equal(searchFolders(symbols, "📚").length, 1);
  assert.equal(searchFolders([], "atencao").length, 0);
});
