import type { Macro } from "../types/macro";
import {
  classifyHubSpotPayload,
  type HubSpotPayloadPlan,
} from "./hubspotPolicy.ts";

export interface IndexedMacro {
  macro: Macro;
  normalizedShortcut: string;
  shortcutLength: number;
  hubspotPlan: HubSpotPayloadPlan;
}

export interface MacroSnapshot {
  macros: Macro[];
  entries: IndexedMacro[];
  maxShortcutLength: number;
}

export function buildMacroSnapshot(macros: Macro[]): MacroSnapshot {
  const entries = macros
    .map((macro) => {
      const normalizedShortcut = macro.atalho.trim().toLowerCase();
      return {
        macro,
        normalizedShortcut,
        shortcutLength: normalizedShortcut.length,
        hubspotPlan: classifyHubSpotPayload(macro.textoExpandido),
      };
    })
    .filter((entry) => entry.shortcutLength > 0)
    .sort((first, second) => second.shortcutLength - first.shortcutLength);

  return {
    macros,
    entries,
    maxShortcutLength: entries[0]?.shortcutLength ?? 0,
  };
}

export function findIndexedMacro(
  snapshot: MacroSnapshot,
  valueBeforeCursor: string,
): IndexedMacro | null {
  const normalizedValue = valueBeforeCursor.toLowerCase();
  return (
    snapshot.entries.find((entry) =>
      normalizedValue.endsWith(entry.normalizedShortcut),
    ) ?? null
  );
}
