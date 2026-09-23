# AGENTS.md

## Project Overview

LilacKeys is a browser extension built with React, TypeScript, Vite, CSS, Node.js, npm, and browser extension APIs.

The project includes functionality related to:

- macro management
- folder organization
- nested folder hierarchies
- macro import and export
- macro expansion
- structured content insertion
- HubSpot compatibility
- WhatsApp compatibility
- placeholder navigation
- keyboard-based workflows
- search and filtering
- browser extension behavior
- browser-specific content insertion
- release/version management

LilacKeys is already functional and actively maintained.

The primary objective is to evolve the project incrementally without breaking existing behavior or introducing regressions.

---

# 1. Purpose

This file defines operational rules for AI coding agents working in this repository.

Read this file before making changes.

These instructions apply to:

- Codex
- ChatGPT coding agents
- IDE agents
- cloud agents
- local development agents
- automated coding workflows

The main goals are:

- preserve existing behavior
- avoid regressions
- maintain compatibility
- keep the project buildable
- respect the current architecture
- avoid unnecessary rewrites
- avoid unnecessary dependencies
- protect production-ready behavior
- keep Git history safe
- support development from multiple computers
- ensure changes are explicit and traceable

When uncertain, prefer the smallest safe change that solves the problem.

---

# 2. Core Principles

Project priority:

```text
stability > correctness > maintainability > simplicity > speed
```

Always prefer:

- small and targeted changes
- incremental improvements
- explicit logic
- predictable behavior
- reuse of existing project patterns
- backward compatibility
- preserving working behavior
- fixing root causes instead of symptoms

Avoid:

- unnecessary rewrites
- broad refactors
- speculative architecture changes
- unrelated cleanup during bug fixes
- modifying stable code without a clear reason
- large formatting-only changes
- introducing complexity without measurable benefit

Do not sacrifice working behavior simply to make the code cleaner.

---

# 3. Main Stack

The project primarily uses:

- React
- TypeScript
- Vite
- CSS
- Node.js
- npm
- Browser Extension APIs
- Chrome-compatible extension APIs

Follow the current stack unless a change is explicitly required.

Do not introduce a new framework or major architectural dependency without a clear technical need.

---

# 4. Existing Functionality Must Be Preserved

Do not remove, replace, or modify existing behavior unless explicitly required.

Changes must preserve, when applicable:

- macro creation
- macro editing
- macro deletion
- macro rendering
- macro expansion
- macro ordering
- macro selection
- folder creation
- folder editing
- folder deletion
- folder hierarchy
- nested folders
- parent-child relationships
- macro-folder associations
- folder selection
- search
- filtering
- import
- export
- placeholders
- placeholder focus
- Tab navigation
- keyboard shortcuts
- keyboard workflows
- HubSpot compatibility
- WhatsApp compatibility
- structured formatting
- line breaks
- paragraphs
- lists
- legacy macro compatibility
- newer macro compatibility
- existing browser behavior
- existing extension behavior

Before modifying an existing feature:

1. identify the current behavior
2. identify affected files
3. understand dependencies
4. identify possible side effects
5. choose the smallest safe change
6. validate the existing behavior afterward

---

# 5. High-Risk Areas

Treat the following areas with extra care:

- `src/components/MacroList/`
- `src/components/FolderTreePicker/`
- `src/utils/exportImport.ts`
- HubSpot integration logic
- WhatsApp integration behavior
- macro expansion logic
- structured content insertion
- placeholder navigation
- folder hierarchy logic
- recursive folder traversal
- import/export compatibility
- `manifest.json`
- browser permissions
- browser content scripts
- project version files

Changes in these areas require extra validation.

---

# 6. MacroList

`MacroList` contains core project behavior.

Do not refactor it casually.

When modifying `MacroList`, preserve:

- macro rendering
- macro ordering
- macro selection
- folder behavior
- search behavior
- filtering behavior
- keyboard behavior
- pointer behavior
- navigation behavior
- integration with other components
- current state relationships
- current folder relationships

Do not rewrite `MacroList` only for stylistic reasons.

If the component becomes difficult to maintain, prefer extracting isolated logic into:

- helper functions
- hooks
- utility modules
- smaller components

Do not replace the entire implementation unless there is a strong technical reason.

---

# 7. Folder Management

Folder management is a core feature.

Preserve:

- nested folders
- parent-child relationships
- recursive hierarchy
- folder selection
- macro-folder associations
- folder tree rendering
- import/export compatibility
- folder ordering
- folder traversal behavior

Never assume folders are flat.

When modifying recursive folder logic, consider:

- root folders
- parent folders
- child folders
- deeply nested descendants
- empty folders
- deleted folders
- imported folders
- exported folders
- missing references
- invalid references
- recursive descendants

Avoid duplicated hierarchy logic.

Reuse existing folder traversal utilities whenever possible.

---

# 8. FolderTreePicker

When modifying `FolderTreePicker` or related folder selection components:

- preserve folder hierarchy
- preserve selection behavior
- preserve nested folder visibility
- preserve keyboard usability
- preserve mouse usability
- preserve existing visual hierarchy
- reuse existing traversal logic
- avoid duplicate hierarchy implementations

Do not introduce a second folder data model unless clearly necessary.

---

# 9. Import and Export

`src/utils/exportImport.ts` is sensitive.

Changes must preserve compatibility with existing exported data whenever possible.

Preserve:

- existing export structure
- macro data
- folder data
- folder relationships
- macro-folder associations
- nested folders
- selected macros
- selected folders
- imported folder hierarchy
- exported folder hierarchy

Do not silently discard data.

Do not change the export format without a clear reason.

If the export format must change:

1. document the change
2. preserve backward compatibility when feasible
3. identify migration implications
4. validate old exported files when possible
5. avoid breaking existing user backups

Import logic must handle malformed or partial data safely when possible.

Do not assume imported data is always perfect.

---

# 10. HubSpot

HubSpot behavior is critical.

Preserve:

- paragraphs
- lists
- line breaks
- structured formatting
- structured content insertion
- placeholders
- placeholder order
- Tab navigation
- legacy macro behavior
- newer macro behavior
- repeated macro insertion
- reliable macro expansion
- formatting consistency

Do not replace structured insertion with plain-text insertion unless explicitly required.

Do not simplify HubSpot insertion logic without validating formatting behavior.

Do not assume HubSpot always exposes the same DOM structure.

Avoid brittle DOM assumptions.

When changing HubSpot-related code, verify:

1. plain paragraphs
2. multiple paragraphs
3. unordered lists
4. ordered lists
5. line breaks
6. placeholders
7. placeholder order
8. Tab navigation
9. legacy macros
10. newer macros
11. repeated insertion
12. insertion in different editor states

Use existing project-specific HubSpot validation tooling when available.

If browser-specific validation scripts exist under `scripts/`, prefer them over creating temporary ad-hoc scripts.

---

# 11. WhatsApp

Changes affecting macro expansion must consider WhatsApp behavior.

Preserve:

- text insertion
- line breaks
- macro expansion reliability
- compatibility with current editor behavior
- existing keyboard behavior

Keep HubSpot-specific behavior isolated whenever possible.

Do not allow HubSpot-specific fixes to unintentionally change WhatsApp behavior.

Platform-specific logic should remain explicit.

---

# 12. Placeholders

Placeholder behavior is a core workflow.

Preserve:

- placeholder detection
- placeholder order
- initial focus
- Tab navigation
- navigation between placeholders
- movement to the next placeholder
- behavior after the final placeholder
- multiple-placeholder behavior
- behavior across supported platforms

Do not remove placeholder functionality as part of unrelated work.

If macro insertion logic changes, verify placeholder behavior explicitly.

---

# 13. Search and Filtering

Search and filtering must not mutate source data.

Preserve:

- folder organization
- macro relationships
- macro visibility logic
- current filtering behavior
- folder state

Prefer derived state.

Avoid duplicated state when possible.

Search must never permanently modify:

- macros
- folders
- relationships
- ordering

Do not perform destructive filtering.

---

# 14. React Guidelines

Follow the existing React patterns in the repository.

Prefer:

- small components
- clear responsibilities
- explicit props
- derived state
- pure helper functions
- reusable hooks when useful
- predictable state transitions

Avoid:

- duplicated state
- unnecessary `useEffect`
- excessive prop drilling when an existing pattern already solves it
- large logic blocks directly inside JSX
- unnecessary re-renders
- premature optimization
- unnecessary memoization

Use:

- `useMemo`
- `useCallback`
- memoization

only when they provide clear technical value.

Do not add optimization complexity without a measurable or structural reason.

---

# 15. TypeScript Guidelines

Prefer:

- explicit types
- reusable interfaces
- existing project types
- narrow types
- discriminated unions when useful
- safe optional handling
- type-safe utilities

Avoid:

- unnecessary `any`
- forced casts
- unsafe non-null assertions
- suppressing errors without justification

Do not use:

```ts
// @ts-ignore
```

unless absolutely necessary.

If suppression is necessary, explain why.

Prefer fixing the type problem instead of hiding it.

---

# 16. CSS Guidelines

Before creating new styles:

- inspect existing component styles
- reuse existing patterns
- avoid duplication
- preserve responsive behavior
- preserve visual consistency
- keep changes scoped

Avoid global CSS changes for local problems.

Do not perform visual redesigns unless explicitly requested.

Do not change unrelated styles during a bug fix.

---

# 17. Architecture

Respect the current architecture.

Before creating new files or directories:

- inspect existing components
- inspect existing utilities
- inspect existing types
- reuse existing patterns
- follow naming conventions

Do not reorganize the entire project to solve a small issue.

Avoid introducing:

- new state-management libraries
- new UI libraries
- new routing solutions
- new build tools
- new architectural layers
- new abstractions without demonstrated need

Keep the architecture proportional to the size of the project.

---

# 18. Dependencies

Do not add dependencies unnecessarily.

Before adding a dependency:

1. check whether the project already supports the required functionality
2. check whether an existing dependency can solve the problem
3. consider a small internal implementation
4. evaluate maintenance impact
5. evaluate bundle impact
6. evaluate browser extension compatibility

Do not update unrelated dependencies during:

- bug fixes
- small features
- refactors

Do not perform bulk dependency upgrades unless explicitly requested.

---

# 19. Versioning

Do not change the project version automatically.

Before modifying version values in:

- `manifest.json`
- `package.json`
- `package-lock.json`

verify that a version bump is explicitly required.

Use Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Example:

```text
1.2.3
```

General interpretation:

- `PATCH`: backward-compatible bug fix
- `MINOR`: backward-compatible feature
- `MAJOR`: breaking change

Do not bump versions only because code changed.

Do not automatically create release versions after every task.

---

# 20. manifest.json

Treat `manifest.json` as a sensitive file.

Do not modify:

- extension permissions
- host permissions
- version
- content scripts
- browser configuration
- extension metadata
- web-accessible resources
- background configuration

unless required by the task.

Keep browser permissions minimal.

Do not add permissions "just in case".

If changing permissions, explain the reason.

---

# 21. Release Files

Do not commit release ZIP files.

The repository must continue ignoring:

```gitignore
*.zip
```

Release archives must remain outside the repository.

Historical release ZIPs may be stored in a separate local folder, such as:

```text
LilacKeys-Releases/
```

Do not remove the ZIP ignore rule unless explicitly required.

Do not place historical ZIP releases back into source control.

---

# 22. Sensitive Files

Never commit:

- `.env`
- `.env.*`
- credentials
- tokens
- API keys
- cookies
- secrets
- private configuration
- machine-specific configuration
- local authentication data

Use:

```text
.env.example
```

when environment variables need to be documented.

Never include real credentials or tokens in example files.

---

# 23. Git Safety

Main branch:

```text
main
```

Before making important changes, run:

```bash
git status
```

Do not start substantial work when the repository contains:

- unresolved merge conflicts
- incomplete merges
- unexpected staged changes
- important uncommitted changes

Do not automatically execute destructive Git commands.

High-risk commands include:

```bash
git reset --hard
git clean -fd
git push --force
git push --force-with-lease
```

Use them only when explicitly required and when their consequences are understood.

Do not rewrite Git history unless explicitly requested.

Do not force-push automatically.

Do not delete branches automatically.

Do not delete tags automatically.

---

# 24. Multi-Computer Workflow

This repository may be used from multiple computers.

GitHub is the source of truth for shared project state.

Each computer may have its own local clone.

Before starting work on a machine:

```bash
git status
git pull
```

Before pushing changes:

```bash
git status
```

Verify:

- the correct branch is active
- no unintended files are staged
- no local-only files are included
- no release ZIPs are included
- no secrets are included

Do not assume files from another computer exist locally unless they are committed.

Local-only files are not synchronized by Git.

Examples:

- `.env`
- ZIP releases
- machine-specific configuration
- local tools
- local caches
- local editor state

GitHub should be treated as the shared source of truth between development machines.

---

# 25. Codex and AI Agent Workflow

AI agents may operate:

- locally
- through IDE integrations
- through desktop applications
- through cloud/web environments

Do not assume a local file exists in another environment unless it is committed.

Project context that should be available across environments must be stored in the repository.

Important persistent project knowledge should be documented in:

- `AGENTS.md`
- `README.md`
- `docs/`
- source comments when appropriate

Do not rely on previous AI conversations as the only source of project knowledge.

The repository itself should contain the operational context needed by future agents.

---

# 26. Development Workflow

Before modifying code:

```bash
git status
git pull
npm install
```

During development:

```bash
npm run dev
```

Before completing a coding task:

```bash
npm run build
```

If tests are available, run the appropriate test command defined in `package.json`.

Do not assume:

```bash
npm test
```

exists without checking project scripts.

---

# 27. Build Validation

Every relevant code change must be validated with:

```bash
npm run build
```

Do not consider a coding task complete if the build fails.

If the build fails:

- identify the root cause
- fix the actual issue
- do not hide errors
- do not suppress errors without justification
- do not disable checks merely to make the build pass

If the build failure is unrelated to the current task, report it clearly.

---

# 28. Existing Validation Scripts

If the repository contains project-specific validation scripts, prefer using them.

Check:

```text
scripts/
docs/
```

before creating temporary validation tools.

HubSpot-specific validation should use existing browser-validation tooling when available.

Do not duplicate validation logic unnecessarily.

---

# 29. Testing

When tests exist:

- update affected tests
- add tests for important bug fixes when practical
- validate edge cases
- avoid modifying tests just to match incorrect behavior

Important areas for testing include:

- folder hierarchy
- recursive folders
- import/export
- macro expansion
- placeholders
- HubSpot formatting
- WhatsApp behavior
- search
- filtering
- selection logic
- browser-specific insertion

If automated tests do not exist for an affected area:

- run the available build
- use existing validation scripts
- report what was not automatically tested
- recommend relevant manual verification

---

# 30. Bug Fixes

When fixing a bug:

1. reproduce or understand the issue
2. identify the root cause
3. identify the smallest safe change
4. avoid unrelated edits
5. preserve existing behavior
6. verify the affected functionality
7. check for regressions
8. run the build
9. run relevant tests or validation
10. explain important changes

Fix the root cause, not only the visible symptom.

---

# 31. Refactoring

Refactoring must preserve behavior.

A refactor should have a clear goal, such as:

- reducing complexity
- improving readability
- removing duplication
- improving maintainability
- isolating responsibilities

Avoid mixing unrelated work into a refactor.

Whenever possible, separate:

- bug fixes
- refactors
- visual changes
- dependency changes
- architectural changes
- release preparation

Avoid large rewrites of stable code unless explicitly requested.

---

# 32. Large or High-Risk Changes

Before making a large structural change:

- explain the proposed approach
- identify affected files
- identify risks
- identify possible regressions
- prefer staged implementation
- prefer reversible changes

Do not make broad architectural changes without clear justification.

If the problem can be solved locally, prefer the local solution.

---

# 33. Code Style

Follow the existing repository style.

Preserve:

- naming conventions
- import patterns
- component conventions
- file organization
- linting behavior
- formatting behavior

Do not reformat unrelated files.

Avoid large formatting-only diffs.

Do not introduce a new formatting style during unrelated work.

---

# 34. Comments

Add comments when they explain:

- non-obvious behavior
- browser-specific behavior
- HubSpot-specific workarounds
- complex recursion
- compatibility constraints
- important edge cases
- unusual DOM behavior

Avoid comments that only restate the code.

Prefer explaining:

```text
why
```

instead of:

```text
what
```

when the code is already self-explanatory.

---

# 35. Documentation

Update documentation when behavior changes significantly.

Relevant documentation may include:

- `README.md`
- files under `docs/`
- implementation notes
- validation instructions
- release notes when appropriate

Do not rewrite unrelated documentation.

Do not create documentation files unnecessarily.

Prefer updating an existing relevant document when possible.

---

# 36. Commits

Use clear and scoped commit messages.

Prefer Conventional Commit-style messages.

Examples:

```text
feat: add folder search
fix: preserve HubSpot formatting
fix(hubspot): preserve structured macro insertion
fix(whatsapp): preserve multiline macro expansion
refactor: simplify macro export logic
docs: update HubSpot validation notes
chore: prepare release metadata
```

Avoid vague messages such as:

```text
update
changes
fix stuff
test
misc
new changes
```

Commit messages should describe the purpose of the change.

Do not automatically create commits unless the workflow or user explicitly requests it.

---

# 37. Pull and Push Safety

Before pulling:

```bash
git status
```

Before pushing:

```bash
git status
git log --oneline -5
```

Do not push:

- unresolved conflicts
- sensitive files
- ZIP releases
- accidental dependency folders
- temporary files
- unrelated changes

Do not force-push unless explicitly required.

Do not assume the local branch is synchronized.

---

# 38. Generated and Ignored Files

Do not version files that belong in `.gitignore`.

Typical ignored files include:

```text
node_modules/
dist/
dist-ssr/
*.zip
*.log
.env
.env.*
```

Do not remove ignore rules unless clearly required.

Do not commit generated build artifacts unless the repository intentionally tracks them.

---

# 39. Build Output

The project may generate build output such as:

```text
dist/
```

Do not treat generated files as source files.

Prefer editing source files and rebuilding.

Do not manually patch build output instead of source code.

---

# 40. Browser Extension Permissions

Permissions must remain minimal.

Before adding a permission:

- identify why it is required
- verify that existing permissions cannot support the feature
- avoid broad permissions
- avoid unnecessary host access

Do not add browser permissions speculatively.

---

# 41. Backward Compatibility

Backward compatibility is important.

When modifying data structures, consider:

- existing users
- existing stored macros
- existing folder data
- previous exports
- older macros
- legacy formatting
- previous browser storage data

Do not silently invalidate existing user data.

If a migration is required:

- make it explicit
- keep it safe
- preserve data when possible
- document the migration logic

---

# 42. Data Integrity

Changes involving persistent data must avoid:

- accidental deletion
- silent overwrites
- broken references
- duplicate relationships
- orphaned folders
- orphaned macros
- invalid hierarchy

When modifying persistent structures, consider migration and rollback implications.

---

# 43. Error Handling

Prefer explicit error handling.

Do not silently swallow important errors.

When an operation can fail:

- handle the failure
- preserve user data
- avoid leaving inconsistent state
- provide meaningful feedback when applicable

Do not use empty `catch` blocks unless intentionally justified.

---

# 44. Performance

Do not optimize prematurely.

Performance work should target real problems.

Prefer:

- efficient derived state
- avoiding unnecessary repeated traversal
- avoiding unnecessary renders
- avoiding avoidable DOM work

Do not sacrifice clarity or correctness for speculative micro-optimizations.

---

# 45. Accessibility and Usability

Preserve keyboard usability.

Do not break:

- Tab navigation
- focus behavior
- keyboard shortcuts
- form interactions
- pointer interactions

When adding interactive UI, consider:

- keyboard use
- focus state
- predictable navigation

Do not remove visible or keyboard focus behavior without a reason.

---

# 46. Security

Do not introduce unsafe behavior.

Avoid:

- injecting unsanitized HTML
- exposing credentials
- broad browser permissions
- unsafe use of external content
- storing sensitive data unnecessarily

When interacting with webpage DOM content, assume external pages may contain unexpected structures.

---

# 47. External Website Integration

LilacKeys interacts with external web applications.

External sites may change independently.

Do not assume DOM structures are permanent.

Integration logic should be:

- defensive
- isolated
- easy to maintain
- tolerant of minor DOM changes when practical

Avoid selectors that are more brittle than necessary.

---

# 48. Project-Specific Browser Validation

For browser-specific behavior, distinguish between:

- successful TypeScript compilation
- successful Vite build
- automated tests
- automated browser validation
- manual browser testing

A successful build does not prove that:

- HubSpot insertion works
- WhatsApp insertion works
- placeholders work
- browser content scripts behave correctly

Do not claim browser behavior was verified unless it was actually validated.

---

# 49. Before Completing Any Task

Verify:

- [ ] The requested behavior was implemented
- [ ] Existing behavior was preserved
- [ ] No unrelated code was changed
- [ ] No sensitive files were added
- [ ] No `.zip` files were committed
- [ ] No unnecessary version bump was made
- [ ] No unnecessary dependency was added
- [ ] No unnecessary browser permissions were added
- [ ] No unresolved Git conflicts remain
- [ ] No incomplete merge remains
- [ ] TypeScript errors were not hidden unnecessarily
- [ ] The project builds successfully
- [ ] Relevant tests were executed when available
- [ ] Relevant validation scripts were executed when applicable
- [ ] Browser-specific limitations were reported
- [ ] Remaining risks were reported
- [ ] Manual checks were identified when needed
- [ ] No unrelated files were reformatted
- [ ] No local-only configuration was committed

---

# 50. Final Response Expectations

After completing a coding task, provide a concise summary containing:

1. what changed
2. which files were affected
3. what was validated
4. build result
5. test result, when applicable
6. browser validation result, when applicable
7. remaining risks
8. manual checks, when applicable

Do not claim behavior was tested if it was not actually tested.

Clearly distinguish between:

- code inspection
- successful build
- automated testing
- automated browser validation
- manual browser testing

Example:

```text
Implemented:
- preserved HubSpot structured insertion while fixing placeholder navigation

Files changed:
- src/...
- src/...

Validated:
- npm run build: passed
- automated tests: passed
- HubSpot browser validation: not performed

Manual check recommended:
- verify Tab navigation after inserting a formatted macro in HubSpot
```

---

# 51. Decision Rules

When choosing between:

1. a broad rewrite
2. a targeted safe change

prefer the targeted safe change.

When choosing between:

1. modifying stable behavior
2. preserving stable behavior

preserve stable behavior unless the task explicitly requires change.

When choosing between:

1. adding a dependency
2. using the existing stack

prefer the existing stack when practical.

When choosing between:

1. changing architecture
2. solving the issue locally

prefer the local solution when maintainable.

When choosing between:

1. speed
2. project safety

prefer project safety.

LilacKeys should evolve incrementally without breaking workflows that already work.
