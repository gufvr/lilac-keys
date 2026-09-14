import type { Macro } from "../types/macro";

const STORAGE_KEY = "lilac-keys-macros";

export interface MacroStorageReader {
  get(
    key: string,
    callback: (result: Record<string, unknown>) => void,
  ): void;
}

export interface MacroRuntimeMessenger {
  readonly lastError?: unknown;
  sendMessage(
    message: { type: "getMacros" },
    callback: (response?: { macros?: Macro[] }) => void,
  ): void;
}

export interface MacroStorageDependencies {
  storage?: MacroStorageReader;
  runtime: MacroRuntimeMessenger;
}

export function loadMacrosFromChrome(
  dependencies: MacroStorageDependencies = getChromeDependencies(),
): Promise<Macro[] | null> {
  return new Promise((resolve) => {
    if (dependencies.storage) {
      try {
        dependencies.storage.get(STORAGE_KEY, (result) => {
          if (!dependencies.runtime.lastError) {
            resolve((result[STORAGE_KEY] as Macro[] | undefined) ?? []);
            return;
          }
          requestMacrosFromBackground(dependencies.runtime, resolve);
        });
        return;
      } catch {
        requestMacrosFromBackground(dependencies.runtime, resolve);
        return;
      }
    }

    requestMacrosFromBackground(dependencies.runtime, resolve);
  });
}

function getChromeDependencies(): MacroStorageDependencies {
  return {
    storage: chrome.storage?.local as MacroStorageReader | undefined,
    runtime: chrome.runtime as MacroRuntimeMessenger,
  };
}

function requestMacrosFromBackground(
  runtime: MacroRuntimeMessenger,
  resolve: (macros: Macro[] | null) => void,
): void {
  try {
    runtime.sendMessage({ type: "getMacros" }, (response) => {
      const error = runtime.lastError;
      if (error) {
        if (!isExtensionContextInvalidated(error)) {
          console.error("LilacKeys: falha ao carregar macros pelo background");
        }
        resolve(null);
        return;
      }
      resolve(response?.macros ?? []);
    });
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      console.error("LilacKeys: falha ao acessar o background da extensão");
    }
    resolve(null);
  }
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return String(error).includes("Extension context invalidated");
}
