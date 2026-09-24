import assert from "node:assert/strict";
import test from "node:test";

import type { Folder, Macro } from "../src/types/macro.ts";
import {
  canReorderVisibleItems,
  prependItemInScope,
  reorderScopedItems,
  sortItemsByOrder,
} from "../src/utils/itemOrdering.ts";

const macro = (
  id: string,
  folderId?: string,
  order?: number,
): Macro => ({
  id,
  nome: id,
  atalho: id,
  textoExpandido: `<p>${id}</p>`,
  folderId,
  order,
});

const moveMacros = (
  items: Macro[],
  ids: string[],
  folderId?: string,
  placement: "inside" | "above" | "below" = "inside",
  relativeToId?: string,
) =>
  reorderScopedItems(items, ids, {
    destinationScope: folderId,
    placement,
    relativeToId,
    getScope: (item) => item.folderId,
    setScope: (item, scope) => ({ ...item, folderId: scope }),
  });

const idsInFolder = (items: Macro[], folderId?: string) =>
  sortItemsByOrder(items.filter((item) => item.folderId === folderId)).map(
    (item) => item.id,
  );

test("reordena um snippet acima e abaixo dentro da mesma pasta", () => {
  const initial = [macro("a", "folder", 0), macro("b", "folder", 1), macro("c", "folder", 2)];
  const above = moveMacros(initial, ["c"], "folder", "above", "a");
  assert.equal(above.moved, true);
  assert.deepEqual(idsInFolder(above.items, "folder"), ["c", "a", "b"]);

  const below = moveMacros(above.items, ["c"], "folder", "below", "b");
  assert.deepEqual(idsInFolder(below.items, "folder"), ["a", "b", "c"]);
});

test("move múltiplos snippets preservando a ordem relativa visível", () => {
  const initial = [macro("a", undefined, 0), macro("b", undefined, 2), macro("c", undefined, 1), macro("d", undefined, 3)];
  const result = moveMacros(initial, ["b", "c"], undefined, "above", "a");
  assert.deepEqual(idsInFolder(result.items), ["c", "b", "a", "d"]);
});

test("move snippets entre raiz e pasta e adiciona inside ao final", () => {
  const initial = [macro("root", undefined), macro("one", "folder", 0), macro("two", "folder", 1)];
  const inFolder = moveMacros(initial, ["root"], "folder");
  assert.deepEqual(idsInFolder(inFolder.items, "folder"), ["one", "two", "root"]);

  const atRoot = moveMacros(inFolder.items, ["one"], undefined);
  assert.deepEqual(idsInFolder(atRoot.items), ["one"]);
  assert.deepEqual(idsInFolder(atRoot.items, "folder"), ["two", "root"]);
});

test("macros legadas sem order mantêm a ordem do array como fallback", () => {
  const legacy = [macro("first"), macro("second"), macro("third")];
  assert.deepEqual(sortItemsByOrder(legacy).map((item) => item.id), [
    "first",
    "second",
    "third",
  ]);
  assert.ok(legacy.every((item) => item.order === undefined));
});

test("não permite reordenar cards quando a busca está ativa", () => {
  assert.equal(canReorderVisibleItems(""), true);
  assert.equal(canReorderVisibleItems("   "), true);
  assert.equal(canReorderVisibleItems("saque"), false);
});

test("move múltiplas pastas acima preservando sua ordem relativa", () => {
  const folders: Folder[] = [
    { id: "a", name: "A", createdAt: 1, order: 0 },
    { id: "b", name: "B", createdAt: 2, order: 2 },
    { id: "c", name: "C", createdAt: 3, order: 1 },
    { id: "d", name: "D", createdAt: 4, order: 3 },
  ];
  const result = reorderScopedItems(folders, ["b", "c"], {
    placement: "above",
    relativeToId: "a",
    getScope: (folder) => folder.parentId,
    setScope: (folder, scope) => ({ ...folder, parentId: scope }),
  });
  assert.deepEqual(sortItemsByOrder(result.items).map((folder) => folder.id), [
    "c",
    "b",
    "a",
    "d",
  ]);

  const below = reorderScopedItems(result.items, ["c", "b"], {
    placement: "below",
    relativeToId: "d",
    getScope: (folder) => folder.parentId,
    setScope: (folder, scope) => ({ ...folder, parentId: scope }),
  });
  assert.deepEqual(sortItemsByOrder(below.items).map((folder) => folder.id), [
    "a",
    "d",
    "c",
    "b",
  ]);
});

test("recusa alvo selecionado sem alterar os itens", () => {
  const initial = [macro("a", undefined, 0), macro("b", undefined, 1)];
  const result = moveMacros(initial, ["a", "b"], undefined, "above", "a");
  assert.equal(result.moved, false);
  assert.equal(result.items, initial);
});

test("ordem e associação de pasta sobrevivem à serialização de storage e exportação", () => {
  const initial = [macro("a", "folder", 0), macro("b", "folder", 1)];
  const moved = moveMacros(initial, ["b"], "folder", "above", "a").items;
  const restored = JSON.parse(JSON.stringify(moved)) as Macro[];
  assert.deepEqual(idsInFolder(restored, "folder"), ["b", "a"]);
  assert.ok(restored.every((item) => item.folderId === "folder"));
  assert.deepEqual(restored.map((item) => item.textoExpandido), [
    "<p>a</p>",
    "<p>b</p>",
  ]);
});

test("prepends a new snippet without changing sibling order", () => {
  const initial = [
    macro("root", undefined, 0),
    macro("first", "folder", 0),
    macro("second", "folder", 1),
  ];
  const result = prependItemInScope(
    initial,
    macro("new", "folder"),
    "folder",
    (item) => item.folderId,
  );

  assert.deepEqual(idsInFolder(result, "folder"), ["new", "first", "second"]);
  assert.deepEqual(idsInFolder(result), ["root"]);
});
