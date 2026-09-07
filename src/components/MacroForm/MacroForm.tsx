import { useState, useEffect, FormEvent } from "react";
import { Folder, Macro } from "../../types/macro";
import { RichTextEditor } from "../RichTextEditor";
import "./MacroForm.css";

interface MacroFormProps {
  macro?: Macro;
  onSubmit: (data: Omit<Macro, "id">) => { success: boolean; error?: string };
  onCancel: () => void;
  onSuccess?: () => void;
  folders?: Folder[];
}

export function MacroForm({
  macro,
  onSubmit,
  onCancel,
  onSuccess,
  folders = [],
}: MacroFormProps) {
  const [nome, setNome] = useState("");
  const [atalho, setAtalho] = useState("");
  const [textoExpandido, setTextoExpandido] = useState("");
  const [folderId, setFolderId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (macro) {
      setNome(macro.nome);
      setAtalho(macro.atalho);
      setTextoExpandido(macro.textoExpandido);
      setFolderId(macro.folderId ?? "");
    }
  }, [macro]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = onSubmit({
      nome: nome.trim(),
      atalho: atalho.trim(),
      textoExpandido: textoExpandido.trim(),
      folderId: folderId || undefined,
    });

    if (result.success) {
      setNome("");
      setAtalho("");
      setTextoExpandido("");
      setFolderId("");
      setError(null);
      onSuccess?.();
    } else {
      setError(result.error || "Erro ao salvar macro");
    }
  };

  const handleCancel = () => {
    setNome("");
    setAtalho("");
    setTextoExpandido("");
    setFolderId("");
    setError(null);
    onCancel();
  };

  return (
    <div
      className="macro-form-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="macro-form-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div className="macro-form-container">
        <form className="macro-form card" onSubmit={handleSubmit}>
        <div className="macro-form-header">
          <h2 id="macro-form-title" className="macro-form-title">
            <span className="material-symbols-outlined">
              {macro ? "edit" : "add"}
            </span>
            {macro ? "Editar Macro" : "Nova Macro"}
          </h2>
        </div>

        {error && (
          <div className="macro-form-error">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <div className="macro-form-field">
          <label htmlFor="folderId" className="macro-form-label">
            Pasta
          </label>
          <select
            id="folderId"
            className="input"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">Sem pasta</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <div className="macro-form-field">
          <label htmlFor="nome" className="macro-form-label">
            Nome da Macro
          </label>
          <input
            id="nome"
            type="text"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Saudação padrão"
            required
          />
        </div>

        <div className="macro-form-field">
          <label htmlFor="atalho" className="macro-form-label">
            Atalho
          </label>
          <input
            id="atalho"
            type="text"
            className="input"
            value={atalho}
            onChange={(e) => setAtalho(e.target.value)}
            placeholder="Ex: /saudacao"
            required
          />
          <small className="macro-form-hint">
            Digite o atalho que será usado para expandir esta macro
          </small>
        </div>

        <div className="macro-form-field">
          <label htmlFor="textoExpandido" className="macro-form-label">
            Texto Expandido
          </label>
          <RichTextEditor
            id="textoExpandido"
            value={textoExpandido}
            onChange={setTextoExpandido}
          />
        </div>

        <div className="macro-form-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
          >
            <span className="material-symbols-outlined">close</span>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            <span className="material-symbols-outlined">save</span>
            {macro ? "Salvar Alterações" : "Criar Macro"}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
