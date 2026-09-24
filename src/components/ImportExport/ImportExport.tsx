import { useMemo, useRef, useState } from "react";
import { Folder, Macro } from "../../types/macro";
import {
  exportMacros,
  filterImportedData,
  getFolderPath,
  getImportMacroConflicts,
  importMacros,
  ImportedData,
} from "../../utils/exportImport";
import "./ImportExport.css";

interface ImportExportProps {
  macros: Macro[];
  onImport: (data: ImportedData) => void;
  folders?: Folder[];
}

export function ImportExport({
  macros,
  onImport,
  folders = [],
}: ImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportedData>();
  const [selectedMacroIds, setSelectedMacroIds] = useState<Set<string>>(
    new Set(),
  );
  const conflicts = useMemo(
    () =>
      preview
        ? getImportMacroConflicts(preview.macros, macros)
        : new Map(),
    [macros, preview],
  );

  const handleExportJSON = () => {
    if (macros.length === 0) {
      alert("Não há macros para exportar");
      return;
    }
    exportMacros(macros, "json", folders);
  };

  const handleExportTXT = () => {
    if (macros.length === 0) {
      alert("Não há macros para exportar");
      return;
    }
    exportMacros(macros, "txt", folders);
  };

  const closePreview = () => {
    setPreview(undefined);
    setSelectedMacroIds(new Set());
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedData = await importMacros(file);
      if (importedData.macros.length === 0) {
        alert("O arquivo não contém macros válidas");
        return;
      }
      const importConflicts = getImportMacroConflicts(importedData.macros, macros);
      setPreview(importedData);
      setSelectedMacroIds(
        new Set(
          importedData.macros
            .filter((macro) => !importConflicts.get(macro.id)?.shortcut)
            .map((macro) => macro.id),
        ),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro ao importar macros");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleMacro = (id: string) => {
    setSelectedMacroIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmImport = () => {
    if (!preview || selectedMacroIds.size === 0) return;
    const selectedData = filterImportedData(preview, selectedMacroIds);
    const shortcutConflicts = selectedData.macros.filter(
      (macro) => conflicts.get(macro.id)?.shortcut,
    ).length;
    if (
      shortcutConflicts > 0 &&
      !window.confirm(
        `${shortcutConflicts} atalho(s) em conflito receberão um sufixo único. Continuar?`,
      )
    ) {
      return;
    }
    onImport(selectedData);
    alert(`${selectedData.macros.length} macro(s) importada(s) com sucesso!`);
    closePreview();
  };

  return (
    <div className="import-export">
      <div className="import-export-header">
        <h3 className="import-export-title">
          <span className="material-symbols-outlined">import_export</span>
          Importar / Exportar
        </h3>
      </div>
      <div className="import-export-actions">
        <div className="import-export-group">
          <span className="import-export-label">Exportar:</span>
          <button
            className="btn btn-secondary"
            onClick={handleExportJSON}
            disabled={macros.length === 0}
          >
            <span className="material-symbols-outlined">download</span>
            JSON
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportTXT}
            disabled={macros.length === 0}
          >
            <span className="material-symbols-outlined">download</span>
            TXT
          </button>
        </div>
        <div className="import-export-group">
          <span className="import-export-label">Importar:</span>
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="material-symbols-outlined">upload</span>
            Arquivo (JSON/TXT)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {preview && (
        <div className="import-preview-backdrop" role="presentation">
          <section
            className="import-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-preview-title"
          >
            <header className="import-preview-header">
              <div>
                <h3 id="import-preview-title">Selecionar macros para importar</h3>
                <p>O conteúdo completo não é exibido nesta prévia.</p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={closePreview}
                aria-label="Fechar prévia de importação"
                title="Cancelar"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>
            <div className="import-preview-selection-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setSelectedMacroIds(
                    new Set(preview.macros.map((macro) => macro.id)),
                  )
                }
              >
                Selecionar todas
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedMacroIds(new Set())}
              >
                Limpar seleção
              </button>
            </div>
            <div className="import-preview-list">
              {preview.macros.map((macro) => {
                const conflict = conflicts.get(macro.id);
                const folderPath = macro.folderId
                  ? getFolderPath(macro.folderId, preview.folders)
                  : macro.folderName || "Sem pasta";
                return (
                  <label className="import-preview-item" key={macro.id}>
                    <input
                      type="checkbox"
                      checked={selectedMacroIds.has(macro.id)}
                      onChange={() => toggleMacro(macro.id)}
                    />
                    <span className="import-preview-item-content">
                      <strong>{macro.nome}</strong>
                      <span>
                        Atalho: <code>{macro.atalho}</code>
                      </span>
                      <span>Pasta: {folderPath}</span>
                      {(conflict?.name || conflict?.shortcut) && (
                        <span className="import-preview-conflict">
                          {conflict.name && "Nome será ajustado. "}
                          {conflict.shortcut &&
                            "Atalho receberá sufixo se esta macro for selecionada."}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <footer className="import-preview-footer">
              <span>{selectedMacroIds.size} selecionada(s)</span>
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closePreview}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmImport}
                  disabled={selectedMacroIds.size === 0}
                >
                  Importar selecionadas
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
