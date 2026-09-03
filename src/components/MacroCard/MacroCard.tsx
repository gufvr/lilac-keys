import { Macro } from "../../types/macro";
import { useState } from "react";
import "./MacroCard.css";

interface MacroCardProps {
  macro: Macro;
  onEdit: (macro: Macro) => void;
  onDelete: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function MacroCard({
  macro,
  onEdit,
  onDelete,
  selected = false,
  onSelect,
}: MacroCardProps) {
  const [expanded, setExpanded] = useState(false);
  const handleDelete = () => {
    if (
      window.confirm(`Tem certeza que deseja excluir a macro "${macro.nome}"?`)
    ) {
      onDelete(macro.id);
    }
  };

  return (
    <div
      className={`macro-card card${expanded ? " is-expanded" : ""}`}
      onClick={() => setExpanded((value) => !value)}
    >
      <div className="macro-card-header">
        {onSelect && (
          <label
            className="macro-card-checkbox"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onClick={(event) => event.stopPropagation()}
              onChange={() => onSelect(macro.id)}
              aria-label={`Selecionar ${macro.nome}`}
            />
            <span className="macro-card-checkbox-mark" aria-hidden="true" />
          </label>
        )}
        <h3 className="macro-card-title">{macro.nome}</h3>
        <div
          className="macro-card-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="btn-icon"
            onClick={() => onEdit(macro)}
            aria-label={`Editar macro ${macro.nome}`}
            title="Editar"
          >
            <span className="material-symbols-outlined">edit</span>
          </button>
          <button
            className="btn-icon btn-icon-danger"
            onClick={handleDelete}
            aria-label={`Excluir macro ${macro.nome}`}
            title="Excluir"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>

      <div className="macro-card-content">
        <div className="macro-card-field">
          <span className="macro-card-label">
            <span className="material-symbols-outlined">keyboard</span>
            Atalho:
          </span>
          <code className="macro-card-shortcut">{macro.atalho}</code>
        </div>

        <div className="macro-card-field">
          <span className="macro-card-label">
            <span className="material-symbols-outlined">text_fields</span>
            Texto:
          </span>
          <div
            className="macro-card-text"
            dangerouslySetInnerHTML={{ __html: macro.textoExpandido }}
          />
        </div>
      </div>
    </div>
  );
}
