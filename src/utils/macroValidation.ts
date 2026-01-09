import { Macro, MacroValidation } from '../types/macro'

export function validateMacro(macro: Partial<Macro>): MacroValidation {
  const errors: string[] = []

  if (!macro.nome || macro.nome.trim().length === 0) {
    errors.push('O nome é obrigatório')
  }

  if (!macro.atalho || macro.atalho.trim().length === 0) {
    errors.push('O atalho é obrigatório')
  }

  if (!macro.textoExpandido || macro.textoExpandido.trim().length === 0) {
    errors.push('O texto expandido é obrigatório')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function isShortcutUnique(
  atalho: string,
  macros: Macro[],
  excludeId?: string
): boolean {
  return !macros.some(
    (macro) =>
      macro.atalho.toLowerCase() === atalho.toLowerCase() &&
      macro.id !== excludeId
  )
}
