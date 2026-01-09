<p align="center">
  <img src="public/lilac-icon.svg" alt="LilacKeys logo" width="120" />
</p>

<h1 align="center">LilacKeys</h1>

<p align='center'>Aplicação web para centralizar, padronizar e gerenciar macros de texto.</p>

## Funcionalidades

- ✅ CRUD completo de macros (id, nome, atalho, texto expandido)
- ✅ Persistência usando StorageService
- ✅ Exportação e importação de macros em JSON e TXT
- ✅ Interface responsiva
- ✅ Tema claro e escuro com identidade visual em lilás (#8471e8)
- ✅ Alternância de tema salva no StorageService

## Tecnologias

- React 18
- TypeScript
- Vite
- Material Icons

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Estrutura do Projeto

```
src/
├── components/
│   ├── Header
│   ├── MacroForm
│   ├── MacroList
│   ├── MacroCard
│   ├── ImportExport
│   └── Help
│
├── hooks/
│   ├── useMacros
│   └── useTheme
│
├── services/
│   └── storageService.ts
│
├── utils/
│   ├── exportImport.ts
│   └── macroValidation.ts
│
├── types/
│   └── macro.ts
│
├── styles/
│
└── main.tsx

```
