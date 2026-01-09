import { useState } from 'react'
import './Help.css'

export function Help() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className='help-container'>
      <button
        className='btn btn-secondary help-toggle'
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className='material-symbols-outlined'>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
        <span className='material-symbols-outlined'>help</span>
        {isOpen ? 'Ocultar Ajuda' : 'Como Usar'}
      </button>

      {isOpen && (
        <div className='help-content card'>
          <h2 className='help-title'>
            <span className='material-symbols-outlined'>info</span>
            Como Usar o LilacKeys
          </h2>

          <div className='help-section'>
            <h3 className='help-section-title'>
              <span className='material-symbols-outlined'>add_circle</span>
              Criando uma Macro
            </h3>
            <ol className='help-list'>
              <li>Preencha o formulário "Nova Macro" com:</li>
              <ul className='help-sublist'>
                <li>
                  <strong>Nome da Macro:</strong> Um nome descritivo (ex:
                  "Saudação padrão")
                </li>
                <li>
                  <strong>Atalho:</strong> O texto que você digitará para
                  expandir a macro (ex: "/oi")
                </li>
                <li>
                  <strong>Texto Expandido:</strong> O texto completo que será
                  inserido
                </li>
              </ul>
              <li>Clique em "Criar Macro" para salvar</li>
            </ol>
          </div>

          <div className='help-section'>
            <h3 className='help-section-title'>
              <span className='material-symbols-outlined'>keyboard</span>
              Como Usar as Macros na Web
            </h3>
            <div className='help-example'>
              <p>
                <strong>Exemplo:</strong> Se você criou uma macro com o nome
                "Oi" e atalho "/oi":
              </p>
              <div className='help-shortcut'>
                <kbd>Shift</kbd> + <kbd>Barra de Espaço</kbd>
              </div>
              <p className='help-note'>
                ⚠️ <strong>Nota:</strong> Atualmente, o LilacKeys funciona como
                um gerenciador de macros. Para usar as macros em outros sites,
                você precisará de uma extensão do navegador. Veja o arquivo{' '}
                <code>CHROME_EXTENSION.md</code> para instruções de como criar a
                extensão.
              </p>
              <p className='help-note'>
                💡 <strong>Dica:</strong> Quando a extensão estiver instalada,
                você poderá digitar o atalho (ex: "/oi") em qualquer campo de
                texto e pressionar <kbd>Shift</kbd> + <kbd>Barra de Espaço</kbd>
                para expandir a macro automaticamente.
              </p>
            </div>
          </div>

          <div className='help-section'>
            <h3 className='help-section-title'>
              <span className='material-symbols-outlined'>edit</span>
              Editando e Excluindo
            </h3>
            <ul className='help-list'>
              <li>
                Clique no ícone{' '}
                <span className='material-symbols-outlined help-inline-icon'>
                  edit
                </span>{' '}
                para editar uma macro
              </li>
              <li>
                Clique no ícone{' '}
                <span className='material-symbols-outlined help-inline-icon'>
                  delete
                </span>{' '}
                para excluir uma macro
              </li>
              <li>Você pode cancelar a edição clicando em "Cancelar"</li>
            </ul>
          </div>

          <div className='help-section'>
            <h3 className='help-section-title'>
              <span className='material-symbols-outlined'>import_export</span>
              Importar e Exportar
            </h3>
            <ul className='help-list'>
              <li>
                <strong>Exportar JSON:</strong> Salva todas as macros em formato
                JSON (recomendado para backup)
              </li>
              <li>
                <strong>Exportar TXT:</strong> Salva as macros em formato texto
                simples (fácil de editar manualmente)
              </li>
              <li>
                <strong>Importar:</strong> Carregue um arquivo JSON ou TXT para
                restaurar suas macros
              </li>
            </ul>
            <div className='help-note'>
              <strong>Formato TXT:</strong> Cada linha representa uma macro,
              separada por tabulação:
              <code className='help-code'>
                Nome da Macro /atalho Texto expandido
              </code>
            </div>
          </div>

          <div className='help-section'>
            <h3 className='help-section-title'>
              <span className='material-symbols-outlined'>palette</span>
              Tema Claro/Escuro
            </h3>
            <p>
              Clique no ícone de tema no canto superior direito para alternar
              entre tema claro e escuro. Sua preferência é salva
              automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
