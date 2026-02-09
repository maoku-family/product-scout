# Phase 1: Project Init Plan

> Path: `~/Repos/personal/product-scout`

---

## Batch 1: Infrastructure

### 1.1 Create Git Repository

```bash
mkdir -p ~/Repos/personal/product-scout
cd ~/Repos/personal/product-scout
git init
```

**Verify:** `git status` shows empty repository

---

### 1.2 Initialize Bun Project

```bash
bun init -y
```

**Verify:** package.json generated

---

### 1.3 Create Directory Structure

```bash
mkdir -p scripts
mkdir -p src/{scrapers,api,core,schemas,utils}
mkdir -p config
mkdir -p db
mkdir -p test/unit
mkdir -p .claude/rules
```

**Verify:** `tree -d` shows complete directory

---

### 1.4 Configure tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "useDefineForClassFields": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "noUncheckedIndexedAccess": true,
    "allowUnreachableCode": false
  },
  "include": ["src", "scripts", "test"]
}
```

**Verify:** `bunx tsc --noEmit` no errors

---

### 1.5 Configure .gitignore

```
node_modules/
db/*.db
config/secrets.yaml
.env
*.log
.DS_Store
```

**Verify:** File exists

---

## Batch 2: Engineering Standards

### 2.1 Configure package.json

```json
{
  "name": "product-scout",
  "type": "module",
  "private": true,
  "scripts": {
    "lint": "eslint . --fix",
    "lint:check": "eslint .",
    "test": "vitest",
    "prepare": "simple-git-hooks"
  },
  "simple-git-hooks": {
    "pre-commit": "bunx lint-staged"
  },
  "lint-staged": {
    "*.ts": "eslint --fix"
  },
  "prettier": {}
}
```

**Note:** Prettier uses default values (double quotes, printWidth 80, trailingComma "all")

**Verify:** JSON format correct

---

### 2.2 Install Dependencies

```bash
# Runtime dependencies
bun add zod yaml

# Dev dependencies
bun add -d typescript eslint typescript-eslint \
  eslint-plugin-unused-imports eslint-plugin-import eslint-plugin-check-file \
  eslint-plugin-github \
  prettier eslint-plugin-prettier eslint-config-prettier \
  simple-git-hooks lint-staged vitest @types/bun
```

**Verify:** `bun install` succeeds, node_modules exists

---

### 2.3 Configure eslint.config.js

Key rules:
- typescript-eslint strictTypeChecked
- explicit-function-return-type
- no-floating-promises
- no-console (use logger instead)
- filename-naming-convention (kebab-case)
- github/array-foreach (use for...of)

**Verify:** `bun run lint:check` executable

---

### 2.4 Initialize Git Hooks

```bash
bun run prepare
```

**Verify:** `.git/hooks/pre-commit` exists

---

## Batch 3: Claude Configuration

### 3.1 Create CLAUDE.md

**Verify:** File exists

---

### 3.2 Create Claude Rules (5 files)

```
.claude/rules/
├── superpowers.md      # Workflow + Notion links
├── data-validation.md  # Zod validation rules
├── error-handling.md   # withRetry error handling
├── scraping.md         # Rate limiting rules
└── git.md              # Git + English-only rules
```

**Verify:** 5 files exist

---

### 3.3 Create Config File Placeholders

- `config/rules.yaml` - Filtering rules
- `config/secrets.yaml.example` - API key template

**Verify:** Files exist

---

### 3.4 Create Utility Functions

- `src/utils/logger.ts` - Unified logging with timestamp
- `src/utils/retry.ts` - Retry with exponential backoff

**Verify:** Files exist, `bunx tsc --noEmit` no errors

---

## Batch 4: Complete Initialization

### 4.1 First Commit

```bash
git add .
git commit -m "Initial project setup"
```

**Verify:** `git log` shows commit

---

### 4.2 Verify Pre-commit Hook

Create a temporary .ts file that violates ESLint rules, try to commit, confirm it's blocked.

**Verify:** Commit blocked, can commit after fix

---

### 4.3 Push to GitHub

```bash
git remote add origin git@github-personal:maoku-family/product-scout.git
git push -u origin main
```

**Verify:** Code visible at GitHub

---

## Completion Criteria

- [x] Git repository initialized
- [x] Directory structure complete
- [x] TypeScript config correct
- [x] ESLint + Prettier working
- [x] Pre-commit hook working
- [x] CLAUDE.md exists
- [x] 5 Claude Rules exist
- [x] First commit successful
- [x] Pushed to GitHub

---

## Execution Log

**Completed:** 2026-02-06

**Changes from Original Plan:**
1. ESLint rules enhanced - Added more rules after comparing with Studio
2. Prettier config - Changed to use defaults (double quotes, printWidth 80)
3. tsconfig.json - Added `allowImportingTsExtensions` and `baseUrl`
4. eslint-plugin-github - New dependency for `array-foreach` rule
5. Claude Rules consolidated - Reduced from 9 to 5 files
6. All documentation in English
7. SSH config for GitHub - Multi-account setup with `github-personal` host
