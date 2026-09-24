import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  loadMacrosFromChrome,
  type MacroRuntimeMessenger,
  type MacroStorageReader,
} from "../src/content/macroStorage.ts";
import type { Macro } from "../src/types/macro.ts";

const savedMacros: Macro[] = [
  {
    id: "macro-1",
    nome: "Saudação",
    atalho: "oi",
    order: 3,
    textoExpandido: "Olá! Como posso ajudar? 😊",
  },
];

test("injeta o content script nos frames internos do HubSpot sem novas permissões", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
  ) as {
    permissions: string[];
    content_scripts: Array<{
      all_frames?: boolean;
      match_about_blank?: boolean;
      match_origin_as_fallback?: boolean;
    }>;
  };
  const contentScript = manifest.content_scripts[0];

  assert.deepEqual(manifest.permissions, [
    "storage",
    "unlimitedStorage",
    "contextMenus",
  ]);
  assert.equal(contentScript.all_frames, true);
  assert.equal(contentScript.match_about_blank, true);
  assert.equal(contentScript.match_origin_as_fallback, true);
});

test("carrega as macros diretamente do chrome.storage.local", async () => {
  let backgroundWasCalled = false;
  const storage: MacroStorageReader = {
    get(key, callback) {
      assert.equal(key, "lilac-keys-macros");
      callback({ [key]: savedMacros });
    },
  };
  const runtime: MacroRuntimeMessenger = {
    sendMessage() {
      backgroundWasCalled = true;
    },
  };

  const result = await loadMacrosFromChrome({ storage, runtime });
  assert.deepEqual(result, savedMacros);
  assert.equal(backgroundWasCalled, false);
});

test("retorna uma lista vazia quando ainda não há macros salvas", async () => {
  const storage: MacroStorageReader = {
    get(_key, callback) {
      callback({});
    },
  };
  const runtime: MacroRuntimeMessenger = {
    sendMessage() {
      throw new Error("O background não deveria ser consultado");
    },
  };

  assert.deepEqual(await loadMacrosFromChrome({ storage, runtime }), []);
});

test("consulta o background quando o acesso direto ao storage falha", async () => {
  const storage: MacroStorageReader = {
    get() {
      throw new Error("storage indisponível");
    },
  };
  const runtime: MacroRuntimeMessenger = {
    sendMessage(message, callback) {
      assert.deepEqual(message, { type: "getMacros" });
      callback({ macros: savedMacros });
    },
  };

  assert.deepEqual(
    await loadMacrosFromChrome({ storage, runtime }),
    savedMacros,
  );
});
