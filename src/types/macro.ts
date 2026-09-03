export interface Macro {
  id: string;
  nome: string;
  atalho: string;
  textoExpandido: string;
  folderId?: string;
  folderName?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
}

export interface MacroValidation {
  isValid: boolean;
  errors: string[];
}
