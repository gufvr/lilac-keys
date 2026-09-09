import { useTheme } from '../../hooks/useTheme'
import './Header.css'

interface HeaderProps {
  onHome: () => void
}

export function Header({ onHome }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className='header'>
      <div className='container'>
        <div className='header-content'>
          <button className='header-title' onClick={onHome} type='button' aria-label='Ir para a raiz das macros'>
            <span className='material-symbols-outlined'>local_florist</span>{' '}
            LilacKeys
          </button>
          <button
            className='btn btn-secondary theme-toggle'
            onClick={toggleTheme}
            aria-label={`Alternar para tema ${
              theme === 'light' ? 'escuro' : 'claro'
            }`}
          >
            <span className='material-symbols-outlined'>
              {theme === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
