import { useState, useEffect } from 'react'
import { Theme } from '../types/theme'
import { ThemeService } from '../services/themeService'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const savedTheme = ThemeService.loadTheme()
    setTheme(savedTheme)
    applyTheme(savedTheme)
  }, [])

  const applyTheme = (newTheme: Theme): void => {
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const toggleTheme = (): void => {
    const newTheme: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    applyTheme(newTheme)
    ThemeService.saveTheme(newTheme)
  }

  return {
    theme,
    toggleTheme,
  }
}
