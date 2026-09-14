import type { Macro } from "../types/macro";
import { buildMacroSnapshot, type MacroSnapshot } from "./macroIndex.ts";
import { loadMacrosFromChrome } from "./macroStorage.ts";

const STORAGE_KEY = "lilac-keys-macros";

type MacroLoader = () => Promise<Macro[] | null>;

export class MacroCache {
  private snapshot: MacroSnapshot | null = null;
  private pendingLoad: Promise<MacroSnapshot | null> | null = null;
  private readonly loadMacros: MacroLoader;

  constructor(loadMacros: MacroLoader) {
    this.loadMacros = loadMacros;
  }

  get current(): MacroSnapshot | null {
    return this.snapshot;
  }

  async getSnapshot(): Promise<MacroSnapshot | null> {
    if (this.snapshot) return this.snapshot;
    if (this.pendingLoad) return this.pendingLoad;

    this.pendingLoad = this.loadMacros()
      .then((macros) => {
        if (!macros) return null;
        this.snapshot = buildMacroSnapshot(macros);
        return this.snapshot;
      })
      .finally(() => {
        this.pendingLoad = null;
      });
    return this.pendingLoad;
  }

  update(macros: Macro[]): MacroSnapshot {
    this.snapshot = buildMacroSnapshot(macros);
    return this.snapshot;
  }
}

export function createChromeMacroCache(): MacroCache {
  const cache = new MacroCache(loadMacrosFromChrome);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    updateMacroCacheFromStorageChange(cache, changes, areaName);
  });
  return cache;
}

export function updateMacroCacheFromStorageChange(
  cache: MacroCache,
  changes: Record<string, { newValue?: unknown }>,
  areaName: string,
): void {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  const macros = changes[STORAGE_KEY].newValue;
  cache.update(Array.isArray(macros) ? (macros as Macro[]) : []);
}
