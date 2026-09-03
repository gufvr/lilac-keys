import { Macro } from "../types/macro";

const STORAGE_KEY = "lilac-keys-macros";

document.addEventListener("keydown", async (e) => {
  if (!(e.key === " " && e.shiftKey)) return;

  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return;
  }

  const start = el.selectionStart ?? 0;
  const valueBeforeCursor = el.value.slice(0, start);
  const { [STORAGE_KEY]: macros = [] } =
    await chrome.storage.local.get(STORAGE_KEY);
  const macro = (macros as Macro[]).find((item) =>
    valueBeforeCursor.endsWith(item.atalho),
  );

  if (!macro) return;

  e.preventDefault();
  el.value =
    el.value.slice(0, start - macro.atalho.length) +
    macro.textoExpandido +
    el.value.slice(start);
  el.selectionStart = el.selectionEnd =
    start - macro.atalho.length + macro.textoExpandido.length;
});
