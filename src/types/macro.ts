export interface Macro {
  id: string
  nome: string
  atalho: string
  textoExpandido: string
}

export interface MacroValidation {
  isValid: boolean
  errors: string[]
}
