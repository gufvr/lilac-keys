import { useState } from "react";
import { Folder } from "../../types/macro";
import { flattenFolders, formatFolderLabel } from "../../utils/folderTree";

interface FolderTreePickerProps {
  folders: Folder[];
  value: string;
  onChange: (folderId: string) => void;
  id?: string;
}

export function FolderTreePicker({
  folders,
  value,
  onChange,
  id = "folderId",
}: FolderTreePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const folderTree = flattenFolders(folders);
  const selectedFolder = folders.find((folder) => folder.id === value);
  const selectedFolderItem = folderTree.find(
    ({ folder }) => folder.id === value,
  );

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <div className="macro-form-folder-picker">
      <button
        id={id}
        type="button"
        className="input macro-form-folder-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>
          {selectedFolder && selectedFolderItem
            ? formatFolderLabel(selectedFolder.name, selectedFolderItem.level)
            : "Sem pasta"}
        </span>
        <span className="material-symbols-outlined" aria-hidden="true">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>
      {isOpen && (
        <div className="macro-form-folder-picker-menu" role="listbox">
          <button
            type="button"
            className={`macro-form-folder-picker-option${!value ? " is-selected" : ""}`}
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
          >
            Sem pasta
          </button>
          {folderTree.map(({ folder, level }) => {
            const hasChildren = folders.some(
              (item) => item.parentId === folder.id,
            );
            const isExpanded = expandedFolders.has(folder.id);
            let parentId = folder.parentId;
            let isVisible = true;
            while (parentId) {
              if (!expandedFolders.has(parentId)) {
                isVisible = false;
                break;
              }
              parentId = folders.find(
                (item) => item.id === parentId,
              )?.parentId;
            }
            if (!isVisible) return null;

            return (
              <div
                key={folder.id}
                className="macro-form-folder-picker-row"
                style={{ paddingLeft: `${0.25 + level * 1.25}rem` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className="macro-folder-destination-toggle"
                    aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                    onClick={() => toggleFolder(folder.id)}
                  >
                    <span className="material-symbols-outlined">
                      {isExpanded ? "expand_more" : "chevron_right"}
                    </span>
                  </button>
                ) : (
                  <span className="macro-folder-destination-toggle-placeholder" />
                )}
                <button
                  type="button"
                  className={`macro-form-folder-picker-option${value === folder.id ? " is-selected" : ""}`}
                  role="option"
                  aria-selected={value === folder.id}
                  onClick={() => {
                    onChange(folder.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined">folder</span>
                  {folder.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
