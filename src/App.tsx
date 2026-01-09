import { useState } from 'react'
import { useMacros } from './hooks/useMacros'
import { Macro } from './types/macro'
import { Header } from './components/Header/Header'
import { MacroForm } from './components/MacroForm/MacroForm'
import { MacroList } from './components/MacroList/MacroList'
import { ImportExport } from './components/ImportExport/ImportExport'
import { Help } from './components/Help/Help'
import './App.css'

function App() {
  const {
    macros,
    loading,
    createMacro,
    updateMacro,
    deleteMacro,
    replaceMacros,
  } = useMacros()
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>(undefined)

  const handleFormSubmit = (data: Omit<Macro, 'id'>) => {
    if (editingMacro) {
      return updateMacro(editingMacro.id, data)
    } else {
      return createMacro(data)
    }
  }

  const handleFormCancel = () => {
    setEditingMacro(undefined)
  }

  const handleEdit = (macro: Macro) => {
    setEditingMacro(macro)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id: string) => {
    deleteMacro(id)
    if (editingMacro?.id === id) {
      setEditingMacro(undefined)
    }
  }

  const handleImport = (importedMacros: Macro[]) => {
    replaceMacros(importedMacros)
  }

  if (loading) {
    return (
      <div className='app-loading'>
        <span className='material-symbols-outlined'>hourglass_empty</span>
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div className='app'>
      <Header />
      <main className='app-main'>
        <div className='container'>
          <Help />
          <ImportExport macros={macros} onImport={handleImport} />
          <MacroForm
            macro={editingMacro}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            onSuccess={handleFormCancel}
          />
          <MacroList
            macros={macros}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </main>
    </div>
  )
}

export default App
