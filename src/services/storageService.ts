import { Folder, Macro } from "../types/macro";

const STORAGE_KEY = "lilac-keys-macros";
const FOLDERS_KEY = "lilac-keys-folders";

type StorageResult = {
  [STORAGE_KEY]?: Macro[];
  [FOLDERS_KEY]?: Folder[];
};

export class StorageService {
  static async saveMacros(macros: Macro[]): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: macros });
    } catch (error) {
      console.error("Erro ao salvar macros:", error);
      throw new Error("Não foi possível salvar as macros");
    }
  }

  static async saveFolders(folders: Folder[]): Promise<void> {
    await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
  }

  static async loadMacros(): Promise<Macro[]> {
    try {
      const result = (await chrome.storage.local.get(
        STORAGE_KEY,
      )) as StorageResult;

      return result[STORAGE_KEY] ?? [];
    } catch (error) {
      console.error("Erro ao carregar macros:", error);
      return [];
    }
  }

  static async loadFolders(): Promise<Folder[]> {
    try {
      const result = (await chrome.storage.local.get(
        FOLDERS_KEY,
      )) as StorageResult;
      return result[FOLDERS_KEY] ?? [];
    } catch (error) {
      console.error("Erro ao carregar pastas:", error);
      return [];
    }
  }

  static async clearMacros(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      console.error("Erro ao limpar macros:", error);
    }
  }
}
