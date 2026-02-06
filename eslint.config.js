import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import checkFile from 'eslint-plugin-check-file';
import github from 'eslint-plugin-github';

export default tseslint.config(
  {
    ignores: ['node_modules', 'dist', 'db', 'config/secrets.yaml', 'eslint.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
      'import': importPlugin,
      'check-file': checkFile,
      'github': github,
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],
      // TypeScript type safety (from Studio)
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/dot-notation': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNever: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
            properties: false,
            variables: false,
          },
        },
      ],
      '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],
      '@typescript-eslint/no-redeclare': 'error',
      // Import rules
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-named-default': 'error',
      'sort-imports': ['error', { ignoreCase: true, ignoreDeclarationSort: true }],
      // File naming
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.ts': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      // Best practices (from Studio)
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-implicit-coercion': ['error', { boolean: true }],
      'no-console': 'error',
      'no-param-reassign': [
        'error',
        {
          props: true,
          ignorePropertyModificationsFor: ['draft', 'acc', 'request', 'response'],
        },
      ],
      'no-template-curly-in-string': 'error',
      'no-underscore-dangle': ['error', { allow: [] }],
      'no-bitwise': 'error',
      'consistent-return': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'no-promise-executor-return': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
      'no-redeclare': 'off', // Use @typescript-eslint/no-redeclare instead
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      'func-names': ['error', 'as-needed', { generators: 'never' }],
      // GitHub plugin - prefer for...of over forEach
      'github/array-foreach': 'error',
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
