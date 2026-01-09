import { Macro } from '../../types/macro'
import { MacroCard } from '../MacroCard/MacroCard'
import './MacroList.css'

interface MacroListProps {
  macros: Macro[]
  onEdit: (macro: Macro) => void
  onDelete: (id: string) => void
}

export function MacroList({ macros, onEdit, onDelete }: MacroListProps) {
  if (macros.length === 0) {
    return (
      <div className='macro-list-empty'>
        <span className='material-symbols-outlined'>inbox</span>
        <p>Nenhuma macro cadastrada ainda.</p>
        <p className='macro-list-empty-hint'>
          Crie sua primeira macro usando o formulário acima.
        </p>
      </div>
    )
  }

  return (
    <div className='macro-list'>
      <div className='macro-list-header'>
        <h2 className='macro-list-title'>
          <span className='material-symbols-outlined'>list</span>
          Macros ({macros.length})
        </h2>
      </div>
      <div className='macro-list-grid'>
        {macros.map((macro) => (
          <MacroCard
            key={macro.id}
            macro={macro}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
