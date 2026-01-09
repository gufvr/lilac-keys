import { Macro } from '../types/macro'

const STORAGE_KEY = 'lilac-keys-macros'

type ChromeStorageResult = {
  [STORAGE_KEY]?: Macro[]
}

export class StorageService {
  static async saveMacros(macros: Macro[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: macros })
  }

  static async loadMacros(): Promise<Macro[]> {
    const result = (await chrome.storage.local.get(
      STORAGE_KEY
    )) as ChromeStorageResult

    return result[STORAGE_KEY] ?? []
  }

  static async clearMacros(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY)
  }
}
