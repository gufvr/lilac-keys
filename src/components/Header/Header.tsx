import { useTheme } from '../../hooks/useTheme'
import './Header.css'

export function Header() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className='header'>
      <div className='container'>
        <div className='header-content'>
          <h1 className='header-title'>
            <span className='material-symbols-outlined'>local_florist</span>{' '}
            LilacKeys
          </h1>
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
