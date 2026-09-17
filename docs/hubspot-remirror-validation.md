# Validação do HubSpot / Remirror (1.2.2)

O adaptador reconhece o compositor gerenciado também pelos ancestrais do host.
Para fragmentos moderados (até 16 KB estruturais, 240 elementos, três imagens e
512 KB incorporados), macros structured ou rich com vários blocos são inseridas
como irmãos válidos na raiz editável. Só o bloco que contém o atalho é dividido:
seu prefixo, os blocos da macro e seu sufixo permanecem na ordem original. O
observador nativo do ProseMirror reconcilia essa alteração em nível de documento.
Isso evita o achatamento de p/ul/ol inseridos dentro de um p já gerenciado.
O content script não acessa APIs privadas, não monta outro editor e não substitui
o `innerHTML` do editor. Macros rich de um só bloco conservam a inserção nativa;
o fluxo protegido para conteúdo acima dos limites moderados permanece existente.

Sublistas legadas diretamente dentro de ul/ol são ligadas ao item anterior;
list items recebem o parágrafo inicial exigido pelo schema ProseMirror. Um br
de preenchimento padrão protege hard breaks finais durante a leitura do DOM.
Esse preenchimento não tem texto: o editor o consome/recria conforme seu modelo.
Não são usados marcadores de texto zero-width nessa inserção. Parágrafos vazios
com NBSP/ZWSP/BOM são normalizados em quebras, sem apagar a linha vazia. Espaços
entre palavras, emojis com ZWJ e conteúdo anterior/posterior não são normalizados.

O host é a raiz explicitamente editável, e não um filho com `isContentEditable`
herdado. A seleção é colocada explicitamente no fim da macro; dois frames são
aguardados antes de conferir texto, listas, links, imagens e formatação inline.
O primeiro placeholder é selecionado somente dentro do trecho recém-inserido.
Sem placeholder, o cursor fica após a macro, antes do conteúdo posterior.

No fluxo protegido, se a colagem for ignorada e não alterar DOM, seleção ou foco, há uma única
tentativa nativa com o fragmento HTML semântico completo. Colagem cancelada ou
parcialmente aceita não é repetida. Falha de estrutura não causa rollback nem
reinserção. O trecho é inspecionado com limites de nós e caracteres; o editor
inteiro não é serializado. Os placeholders são encontrados no trecho inserido
mesmo quando o schema remove os atributos `data-*`.

As dependências jsdom e ProseMirror são somente de desenvolvimento. Os testes
exercitam `EditorView`, parser, observador DOM, seleção e transações reais. Uma
regressão demonstra o achatamento da inserção dentro de p; outra confere a
inserção em nível de documento. O navegador local verifica comandos nativos,
BvTT seguida de PJPJ no final e antes da assinatura, Tab e o content script
completo com storage simulado. Os testes não provam que todos os plugins/canais
do HubSpot aceitam tudo. Não há acesso autenticado ao HubSpot nesta sessão;
a validação abaixo ainda é necessária. Nenhum cadastro de macro é regravado.

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
   No mesmo rascunho, expanda BvTT, substitua %NOME%, crie uma linha antes de
   “Att” e expanda PJPJ. Repita com PFPJ/PFMEI e depois no fim do rascunho.
6. Expanda entre dois trechos já escritos; confirme que ambos continuam intactos
   e que, sem placeholder, o cursor fica ao fim da macro, antes do texto posterior.
7. Crie/edite uma macro com HTML, quebras e imagem suportada. Teste sem reinstalar
   a extensão para exercitar a atualização do cache. Macros antigas usam o mesmo
   adaptador e não precisam ser regravadas.
8. Confira o rascunho depois de salvo/reaberto. Só envie mensagens em uma conversa
   de teste apropriada.
9. No lugar de %txt% já substituído por um atalho, insira uma macro curta com
   dois parágrafos (por exemplo, saqueF). Verifique as duas linhas e pressione
   Enter/Shift+Enter: não deve surgir texto zero-width ou um parágrafo técnico
   contendo só espaços. Linhas vazias reais do cadastro devem continuar existindo.

## Teste de navegador local

Execute `node scripts/verify-hubspot-browser.mjs`. No Windows, usa um perfil
temporário do Edge, sem acessar sua sessão e sem extensões instaladas. Para outro
executável, defina `LILAC_TEST_BROWSER`. A página e o código são servidos somente
em localhost; imagens externas são bloqueadas. A origem de um iframe HubSpot é
simulada no teste do content script, não é uma conexão ao HubSpot real.

Para conferir o arquivo de macros real sem modificá-lo:

```powershell
node scripts/verify-hubspot-browser.mjs --macros "C:\Users\gustavo.favero\Downloads\lilac-keys-macros-2026-09-14.json"
```

O comando seleciona apenas as macros de regressão, reporta resultados/duração e
não imprime conteúdo ou links. O navegador pode exigir execução fora do sandbox
de ferramentas por causa dos subprocessos gráficos; o perfil continua isolado.

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
