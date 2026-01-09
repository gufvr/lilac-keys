import { useState, useEffect, useCallback } from 'react'
import { Macro } from '../types/macro'
import { StorageService } from '../services/storageService'
import { validateMacro, isShortcutUnique } from '../utils/macroValidation'

export function useMacros() {
  const [macros, setMacros] = useState<Macro[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadedMacros = StorageService.loadMacros()
    setMacros(loadedMacros)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading) {
      StorageService.saveMacros(macros)
    }
  }, [macros, loading])

  const createMacro = useCallback(
    (macroData: Omit<Macro, 'id'>): { success: boolean; error?: string } => {
      const validation = validateMacro(macroData)
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') }
      }

      if (!isShortcutUnique(macroData.atalho, macros)) {
        return { success: false, error: 'Este atalho já está em uso' }
      }

      const newMacro: Macro = {
        ...macroData,
        id: crypto.randomUUID(),
      }

      setMacros((prev) => [...prev, newMacro])
      return { success: true }
    },
    [macros]
  )

  const updateMacro = useCallback(
    (
      id: string,
      macroData: Partial<Macro>
    ): { success: boolean; error?: string } => {
      const validation = validateMacro(macroData)
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') }
      }

      if (macroData.atalho && !isShortcutUnique(macroData.atalho, macros, id)) {
        return { success: false, error: 'Este atalho já está em uso' }
      }

      setMacros((prev) =>
        prev.map((macro) =>
          macro.id === id ? { ...macro, ...macroData } : macro
        )
      )
      return { success: true }
    },
    [macros]
  )

  const deleteMacro = useCallback((id: string): void => {
    setMacros((prev) => prev.filter((macro) => macro.id !== id))
  }, [])

  const getMacroById = useCallback(
    (id: string): Macro | undefined => {
      return macros.find((macro) => macro.id === id)
    },
    [macros]
  )

  const replaceMacros = useCallback((newMacros: Macro[]): void => {
    setMacros(newMacros)
  }, [])

  return {
    macros,
    loading,
    createMacro,
    updateMacro,
    deleteMacro,
    getMacroById,
    replaceMacros,
  }
}
