import { useRef } from 'react'
import { Macro } from '../../types/macro'
import { exportMacros, importMacros } from '../../utils/exportImport'
import './ImportExport.css'

interface ImportExportProps {
  macros: Macro[]
  onImport: (macros: Macro[]) => void
}

export function ImportExport({ macros, onImport }: ImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportJSON = () => {
    if (macros.length === 0) {
      alert('Não há macros para exportar')
      return
    }
    exportMacros(macros, 'json')
  }

  const handleExportTXT = () => {
    if (macros.length === 0) {
      alert('Não há macros para exportar')
      return
    }
    exportMacros(macros, 'txt')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const importedMacros = await importMacros(file)

      if (importedMacros.length === 0) {
        alert('O arquivo não contém macros válidas')
        return
      }

      const confirmMessage =
        macros.length > 0
          ? `Importar ${importedMacros.length} macro(s)? Isso substituirá as ${macros.length} macro(s) existente(s).`
          : `Importar ${importedMacros.length} macro(s)?`

      if (window.confirm(confirmMessage)) {
        onImport(importedMacros)
        alert(`${importedMacros.length} macro(s) importada(s) com sucesso!`)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao importar macros')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className='import-export'>
      <div className='import-export-header'>
        <h3 className='import-export-title'>
          <span className='material-symbols-outlined'>import_export</span>
          Importar / Exportar
        </h3>
      </div>
      <div className='import-export-actions'>
        <div className='import-export-group'>
          <span className='import-export-label'>Exportar:</span>
          <button
            className='btn btn-secondary'
            onClick={handleExportJSON}
            disabled={macros.length === 0}
          >
            <span className='material-symbols-outlined'>download</span>
            JSON
          </button>
          <button
            className='btn btn-secondary'
            onClick={handleExportTXT}
            disabled={macros.length === 0}
          >
            <span className='material-symbols-outlined'>download</span>
            TXT
          </button>
        </div>
        <div className='import-export-group'>
          <span className='import-export-label'>Importar:</span>
          <button className='btn btn-secondary' onClick={handleImportClick}>
            <span className='material-symbols-outlined'>upload</span>
            Arquivo (JSON/TXT)
          </button>
          <input
            ref={fileInputRef}
            type='file'
            accept='.json,.txt'
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
