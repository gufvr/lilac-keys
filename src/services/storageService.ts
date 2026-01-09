import { Macro } from '../types/macro'

const STORAGE_KEY = 'lilac-keys-macros'

export class StorageService {
  static async saveMacros(macros: Macro[]): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: macros })
    } catch (error) {
      console.error('Erro ao salvar macros:', error)
      throw new Error('Não foi possível salvar as macros')
    }
  }

  static async loadMacros(): Promise<Macro[]> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      return result[STORAGE_KEY] || []
    } catch (error) {
      console.error('Erro ao carregar macros:', error)
      return []
    }
  }

  static clearMacros(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Erro ao limpar macros:', error)
    }
  }
}
