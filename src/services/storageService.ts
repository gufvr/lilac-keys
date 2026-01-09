import { Macro } from '../types/macro'

const STORAGE_KEY = 'lilac-keys-macros'

export class StorageService {
  static saveMacros(macros: Macro[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(macros))
    } catch (error) {
      console.error('Erro ao salvar macros:', error)
      throw new Error('Não foi possível salvar as macros')
    }
  }

  static loadMacros(): Macro[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (!data) {
        return []
      }
      return JSON.parse(data) as Macro[]
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
