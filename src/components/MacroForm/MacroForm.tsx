import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { Folder, Macro } from "../../types/macro";
import { FolderTreePicker } from "../FolderTreePicker/FolderTreePicker";
import { RichTextEditor } from "../RichTextEditor";
import "./MacroForm.css";

interface MacroFormProps {
  macro?: Macro;
  onSubmit: (data: Omit<Macro, "id">) => { success: boolean; error?: string };
  onCancel: () => void;
  onSuccess?: () => void;
  folders?: Folder[];
}

interface MacroFormValues {
  nome: string;
  atalho: string;
  textoExpandido: string;
  folderId: string;
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
  const [isExitConfirmationOpen, setIsExitConfirmationOpen] = useState(false);
  const initialValuesRef = useRef<MacroFormValues>();
  const formRef = useRef<HTMLFormElement>(null);
  const nomeInputRef = useRef<HTMLInputElement>(null);
  const atalhoInputRef = useRef<HTMLInputElement>(null);
  const cancelExitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const initialValues = {
      nome: macro?.nome ?? "",
      atalho: macro?.atalho ?? "",
      textoExpandido: macro?.textoExpandido ?? "",
      folderId: macro?.folderId ?? "",
    };
    initialValuesRef.current = initialValues;
    setNome(initialValues.nome);
    setAtalho(initialValues.atalho);
    setTextoExpandido(initialValues.textoExpandido);
    setFolderId(initialValues.folderId);
    setError(null);
    setIsExitConfirmationOpen(false);
  }, [macro]);

  useEffect(() => {
    if (isExitConfirmationOpen) cancelExitButtonRef.current?.focus();
  }, [isExitConfirmationOpen]);

  const hasUnsavedChanges = useCallback(() => {
    const initialValues = initialValuesRef.current;
    return (
      !initialValues ||
      nome !== initialValues.nome ||
      atalho !== initialValues.atalho ||
      textoExpandido !== initialValues.textoExpandido ||
      folderId !== initialValues.folderId
    );
  }, [atalho, folderId, nome, textoExpandido]);

  const closeForm = useCallback(() => {
    setIsExitConfirmationOpen(false);
    setError(null);
    onCancel();
  }, [onCancel]);

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setIsExitConfirmationOpen(true);
      return;
    }
    closeForm();
  }, [closeForm, hasUnsavedChanges]);

  const focusFirstInvalidField = useCallback(() => {
    if (!nome.trim()) {
      nomeInputRef.current?.focus();
      return;
    }
    if (!atalho.trim()) {
      atalhoInputRef.current?.focus();
      return;
    }
    if (!textoExpandido.trim()) {
      document.getElementById("textoExpandido")?.focus();
    }
  }, [atalho, nome, textoExpandido]);

  const saveMacro = () => {
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
      return true;
    }

    setError(result.error || "Erro ao salvar macro");
    focusFirstInvalidField();
    return false;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut =
        event.key === "Enter" && (event.ctrlKey || event.metaKey);
      if (isSaveShortcut) {
        event.preventDefault();
        if (!event.repeat && !isExitConfirmationOpen) {
          formRef.current?.requestSubmit();
        }
        return;
      }

      if (event.key !== "Escape") return;

      event.preventDefault();
      if (isExitConfirmationOpen) {
        setIsExitConfirmationOpen(false);
      } else {
        requestClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExitConfirmationOpen, requestClose]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveMacro();
  };

  return (
    <div
      className="macro-form-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="macro-form-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="macro-form-container">
        <form ref={formRef} className="macro-form card" onSubmit={handleSubmit}>
        <div className="macro-form-header">
          <h2 id="macro-form-title" className="macro-form-title">
            <span className="material-symbols-outlined">
              {macro ? "edit" : "add"}
            </span>
            {macro ? "Editar Macro" : "Nova Macro"}
          </h2>
        </div>

        {error && (
          <div className="macro-form-error" role="alert">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <div className="macro-form-field">
          <label htmlFor="folderId" className="macro-form-label">
            Pasta
          </label>
          <FolderTreePicker
            id="folderId"
            folders={folders}
            value={folderId}
            onChange={setFolderId}
          />
        </div>

        <div className="macro-form-field">
          <label htmlFor="nome" className="macro-form-label">
            Nome da Macro
          </label>
          <input
            ref={nomeInputRef}
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
            ref={atalhoInputRef}
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
            onClick={requestClose}
          >
            <span className="material-symbols-outlined">close</span>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            title="Salvar com Ctrl ou Command + Enter"
          >
            <span className="material-symbols-outlined">save</span>
            {macro ? "Salvar Alterações" : "Criar Macro"}
            <span className="macro-form-save-shortcut">Ctrl + Enter</span>
          </button>
        </div>
        </form>
      </div>
      {isExitConfirmationOpen && (
        <div
          className="macro-form-exit-confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsExitConfirmationOpen(false);
            }
          }}
        >
          <div
            className="macro-form-exit-confirmation card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="macro-form-exit-confirmation-title"
            aria-describedby="macro-form-exit-confirmation-description"
          >
            <div className="macro-form-exit-confirmation-icon" aria-hidden="true">
              <span className="material-symbols-outlined">warning</span>
            </div>
            <h3 id="macro-form-exit-confirmation-title">
              Alterações não salvas
            </h3>
            <p id="macro-form-exit-confirmation-description">
              Você possui alterações não salvas. O que deseja fazer?
            </p>
            <div className="macro-form-exit-confirmation-actions">
              <button
                ref={cancelExitButtonRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsExitConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (!saveMacro()) setIsExitConfirmationOpen(false);
                }}
              >
                <span className="material-symbols-outlined">save</span>
                Salvar e sair
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={closeForm}
              >
                <span className="material-symbols-outlined">logout</span>
                Sair sem salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
