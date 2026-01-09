import { Macro } from '../types/macro'

type ProKeysSnippet = {
  name: string
  body: string
}

export function exportMacros(
  macros: Macro[],
  format: 'json' | 'txt' = 'json'
): void {
  try {
    let dataStr: string
    let mimeType: string
    let extension: string

    if (format === 'txt') {
      dataStr = macros
        .map(
          (macro) =>
            `${macro.nome}\t${macro.atalho}\t${macro.textoExpandido.replace(
              /\n/g,
              '\\n'
            )}`
        )
        .join('\n')
      mimeType = 'text/plain'
      extension = 'txt'
    } else {
      dataStr = JSON.stringify(macros, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    }

    const dataBlob = new Blob([dataStr], { type: mimeType })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lilac-keys-macros-${
      new Date().toISOString().split('T')[0]
    }.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Erro ao exportar macros:', error)
    throw new Error('Não foi possível exportar as macros')
  }
}

export async function importMacros(file: File): Promise<Macro[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      try {
        const content = reader.result as string
        const fileName = file.name.toLowerCase()

        if (fileName.endsWith('.txt')) {
          const lines = content
            .split('\n')
            .filter((line) => line.trim().length > 0)

          const macros = lines.map((line, index) => {
            const parts = line.split('\t')

            if (parts.length < 3) {
              throw new Error(`Linha ${index + 1} está em formato inválido`)
            }

            return {
              id: crypto.randomUUID(),
              nome: parts[0].trim(),
              atalho: parts[1].trim(),
              textoExpandido: parts.slice(2).join('\t').replace(/\\n/g, '\n'),
            }
          })

          resolve(macros)
          return
        }

        const parsed = JSON.parse(content)

        if (parsed?.snippets && Array.isArray(parsed.snippets)) {
          const snippets = parsed.snippets.filter(
            (item: any) => typeof item === 'object' && item?.name && item?.body
          )

          const macros: Macro[] = snippets.map((snippet: ProKeysSnippet) => ({
            id: crypto.randomUUID(),
            nome: snippet.name,
            atalho: `@${snippet.name.toLowerCase()}`,
            textoExpandido: stripHtml(snippet.body),
          }))

          resolve(macros)
          return
        }

        if (!Array.isArray(parsed)) {
          reject(new Error('O arquivo JSON não contém um array de macros'))
          return
        }

        const isValid = parsed.every(
          (macro) =>
            typeof macro.nome === 'string' &&
            typeof macro.atalho === 'string' &&
            typeof macro.textoExpandido === 'string'
        )

        if (!isValid) {
          reject(new Error('O arquivo contém macros com estrutura inválida'))
          return
        }

        const macros: Macro[] = parsed.map((macro) => ({
          ...macro,
          id: macro.id ?? crypto.randomUUID(),
        }))

        resolve(macros)
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error('Erro ao processar o arquivo')
        )
      }
    }

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo'))
    }

    reader.readAsText(file)
  })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}
