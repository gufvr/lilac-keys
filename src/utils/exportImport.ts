import { Macro } from '../types/macro'

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

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const fileName = file.name.toLowerCase()
        let macros: Macro[]

        if (fileName.endsWith('.txt')) {
          const lines = content
            .split('\n')
            .filter((line) => line.trim().length > 0)
          macros = lines.map((line, index) => {
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
        } else {
          macros = JSON.parse(content) as Macro[]

          if (!Array.isArray(macros)) {
            reject(new Error('O arquivo não contém um array de macros'))
            return
          }

          const isValid = macros.every(
            (macro) =>
              macro.id &&
              typeof macro.nome === 'string' &&
              typeof macro.atalho === 'string' &&
              typeof macro.textoExpandido === 'string'
          )

          if (!isValid) {
            reject(new Error('O arquivo contém macros com estrutura inválida'))
            return
          }
        }

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
