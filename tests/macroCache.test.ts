import assert from "node:assert/strict";
import test from "node:test";

import {
  MacroCache,
  updateMacroCacheFromStorageChange,
} from "../src/content/macroCache.ts";
import {
  buildMacroSnapshot,
  findIndexedMacro,
} from "../src/content/macroIndex.ts";
import type { Macro } from "../src/types/macro.ts";

const macros: Macro[] = [
  { id: "1", nome: "Curta", atalho: "/oi", textoExpandido: "Olá" },
  {
    id: "2",
    nome: "Completa",
    atalho: "/oi-completo",
    textoExpandido: "Olá, tudo bem?",
  },
];

test("pré-calcula o maior atalho e prioriza a correspondência mais longa", () => {
  const snapshot = buildMacroSnapshot(macros);
  assert.equal(snapshot.maxShortcutLength, "/oi-completo".length);
  assert.equal(findIndexedMacro(snapshot, "texto /oi-completo")?.macro.id, "2");
  assert.equal(snapshot.entries[0].hubspotPlan.strategy, "rich");
});

test("pré-calcula e atualiza a política do HubSpot para macros futuras", () => {
  const cache = new MacroCache(async () => macros);
  const large: Macro[] = [
    {
      id: "large",
      nome: "Grande",
      atalho: "/grande",
      textoExpandido: `<p>${"x".repeat(5 * 1024)}</p>`,
    },
  ];

  const updated = cache.update(large);
  assert.equal(updated.entries[0].hubspotPlan.strategy, "structured");
});

test("carrega as macros uma única vez e reutiliza o snapshot", async () => {
  let loads = 0;
  const cache = new MacroCache(async () => {
    loads += 1;
    return macros;
  });

  const [first, second] = await Promise.all([
    cache.getSnapshot(),
    cache.getSnapshot(),
  ]);
  assert.equal(loads, 1);
  assert.equal(first, second);
  assert.equal(await cache.getSnapshot(), first);
  assert.equal(loads, 1);
});

test("invalida o índice quando chrome.storage.onChanged notifica mudanças", async () => {
  const cache = new MacroCache(async () => macros);
  await cache.getSnapshot();
  const updated: Macro[] = [
    { id: "3", nome: "Nova", atalho: "/nova", textoExpandido: "Nova" },
  ];

  updateMacroCacheFromStorageChange(
    cache,
    { "lilac-keys-macros": { newValue: updated } },
    "local",
  );
  assert.equal(findIndexedMacro(cache.current!, "teste /nova")?.macro.id, "3");
  assert.equal(findIndexedMacro(cache.current!, "teste /oi"), null);
});

test("recalcula o plano do HubSpot ao receber mudança do storage", () => {
  const cache = new MacroCache(async () => macros);
  updateMacroCacheFromStorageChange(
    cache,
    {
      "lilac-keys-macros": {
        newValue: [
          {
            id: "updated",
            nome: "Atualizada",
            atalho: "/atualizada",
            textoExpandido: `<p>${"x".repeat(25 * 1024)}</p>`,
          },
        ],
      },
    },
    "local",
  );

  assert.equal(cache.current?.entries[0].hubspotPlan.strategy, "structured");
});

test("preserva base64 segura sem deixar o payload bloquear o plano do HubSpot", () => {
  const embeddedImage = `data:image/png;base64,${"A".repeat(150 * 1024)}`;
  const snapshot = buildMacroSnapshot([
    {
      id: "with-image",
      nome: "Com imagem antiga",
      atalho: "/imagem",
      textoExpandido:
        `<p>Texto preservado</p><img src="${embeddedImage}" alt="Antiga">` +
        '<img src="https://cdn.example.com/nova.png" alt="Nova">',
    },
  ]);
  const entry = snapshot.entries[0];

  assert.notEqual(entry.hubspotPlan.strategy, "blocked");
  assert.match(entry.hubspotHtml, /data:image\/png;base64/);
  assert.match(entry.hubspotHtml, /<p>Texto preservado<\/p>/);
  assert.match(entry.hubspotHtml, /https:\/\/cdn\.example\.com\/nova\.png/);
});

test("remove base64 individual acima do limite antes de classificar", () => {
  const embeddedImage = `data:image/png;base64,${"A".repeat(700 * 1024)}`;
  const snapshot = buildMacroSnapshot([
    {
      id: "oversized-image",
      nome: "Imagem excessiva",
      atalho: "/grande",
      textoExpandido: `<p>Texto preservado</p><img src="${embeddedImage}">`,
    },
  ]);
  const entry = snapshot.entries[0];

  assert.doesNotMatch(entry.hubspotHtml, /data:image/);
  assert.match(entry.hubspotHtml, /Texto preservado/);
  assert.notEqual(entry.hubspotPlan.strategy, "blocked");
});
