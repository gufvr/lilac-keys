# Validação do HubSpot / Remirror (1.2.1)

O adaptador usa o evento de colagem com `text/html` e `text/plain` para entregar a
macro ao parser e à transação do ProseMirror. O content script fica no mundo
isolado do Chrome: não acessa propriedades privadas de React/Remirror, não monta
outro editor e não substitui o `innerHTML` do editor.

O host é a raiz explicitamente editável, e não um filho com `isContentEditable`
herdado. A seleção é sincronizada antes da colagem. O estado de Shift é liberado
no handler do editor para que o atalho Shift+Space não transforme a colagem em
texto puro. Dois frames são aguardados antes de conferir o trecho inserido.

Se a colagem for ignorada e não alterar DOM, seleção ou foco, há uma única
tentativa nativa com o fragmento HTML semântico completo. Colagem cancelada ou
parcialmente aceita não é repetida. Falha de estrutura não causa rollback nem
reinserção. O trecho é inspecionado com limites de nós e caracteres; o editor
inteiro não é serializado. Os placeholders são encontrados no trecho inserido
mesmo quando o schema remove os atributos `data-*`.

As dependências jsdom e ProseMirror são somente de desenvolvimento. Os testes
exercitam `EditorView`, parser, seleção e transações reais em DOM de teste. Isso
não demonstra que o schema/plugins da instância atual do HubSpot aceitam tudo.
Não há navegador autenticado acessível nesta sessão; a validação real abaixo
continua necessária. Também não há evidência suficiente para atribuir a regressão
a uma atualização específica do HubSpot.

## Como validar no Chrome

1. Execute `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build`.
2. Em `chrome://extensions`, use a instalação de desenvolvimento carregada de
   `C:\VSC\lilac-keys\dist`. Desative uma eventual cópia da Web Store durante o
   teste, para que duas instalações não processem o mesmo atalho. Recarregar uma
   instalação da Web Store não carrega este build local.
3. Recarregue a aba do HubSpot após recarregar a extensão. Use um rascunho de teste.
4. Expanda `Olá, %NOME%.` seguido de outro parágrafo com `%PROTOCOLO%`.
   O primeiro campo deve ficar selecionado; substitua, pressione Tab e preencha
   o segundo. Tab após o último campo e Shift+Tab devem funcionar normalmente.
5. Teste as estruturas usadas por Ag2D/aguardaSaque e SaquePJ: parágrafos,
   parágrafos vazios, links, bullets e placeholders. Teste também PJPJ/PFPJ com
   duas listas numeradas independentes e listas aninhadas. Verifique a ordem e
   o recuo, inclusive depois de tirar e devolver o foco ao editor.
6. Expanda entre dois trechos já escritos; confirme que ambos continuam intactos
   e que, sem placeholder, o cursor fica ao fim da macro, antes do texto posterior.
7. Crie/edite uma macro com HTML, quebras e imagem suportada. Teste sem reinstalar
   a extensão para exercitar a atualização do cache. Macros antigas usam o mesmo
   adaptador e não precisam ser regravadas.
8. Confira o rascunho depois de salvo/reaberto. Só envie mensagens em uma conversa
   de teste apropriada.

O console fica silencioso no sucesso. Falhas LilacKeys registram somente
estratégia, tipo de editor, quantidade de blocos, duração e motivo. Não inclua
HTML ou conteúdo de atendimento ao reportar um problema.

Os limites existentes de 128 KB de conteúdo, 1.000 elementos e imagens suportadas
continuam em vigor. O parser/transação do editor é síncrono; uma macro muito
grande ainda pode demorar. Os tempos do jsdom não medem o tempo da interface real.
Plugins do HubSpot, canais com schema restrito ou políticas de imagens podem
recusar parte da formatação; nesse caso a verificação reporta falha e não duplica
o conteúdo já aceito. Nenhum novo ZIP é produzido nesta fase de validação.

Referências de implementação: [handler de colagem do ProseMirror](https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts)
e [API EditorView](https://prosemirror.net/docs/ref/#view.EditorView).
