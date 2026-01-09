import { Theme } from '../types/theme'

const THEME_STORAGE_KEY = 'lilac-keys-theme'

export class ThemeService {
  static saveTheme(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (error) {
      console.error('Erro ao salvar tema:', error)
    }
  }

  static loadTheme(): Theme {
    try {
      const theme = localStorage.getItem(THEME_STORAGE_KEY)
      if (theme === 'light' || theme === 'dark') {
        return theme
      }
      return 'light'
    } catch (error) {
      console.error('Erro ao carregar tema:', error)
      return 'light'
    }
  }
}
