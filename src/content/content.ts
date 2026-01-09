import { Macro } from '../types/macro'

const STORAGE_KEY = 'lilac-keys-macros'

let buffer = ''

document.addEventListener('keydown', async (e) => {
  if (e.key.length === 1) {
    buffer += e.key
  }

  if (e.key === 'Tab') {
    const { [STORAGE_KEY]: macros = [] } = await chrome.storage.local.get(
      STORAGE_KEY
    )

    const macro = (macros as Macro[]).find((m) => buffer.endsWith(m.atalho))

    if (!macro) {
      buffer = ''
      return
    }

    const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement
    if (!el) return

    const start = el.selectionStart ?? 0
    const value = el.value

    el.value =
      value.slice(0, start - macro.atalho.length) +
      macro.textoExpandido +
      value.slice(start)

    el.selectionStart = el.selectionEnd =
      start - macro.atalho.length + macro.textoExpandido.length

    buffer = ''
  }
})
