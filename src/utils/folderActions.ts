export interface FolderActionEvent {
  stopPropagation: () => void;
}

export function runFolderAction(
  event: FolderActionEvent,
  action: () => void,
): void {
  event.stopPropagation();
  action();
}

export function isolateFolderAction(event: FolderActionEvent): void {
  event.stopPropagation();
}
