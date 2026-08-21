module.exports = {
  // Stop config cascading upward: inside a git worktree nested under the main
  // checkout (.worktrees/<branch>), eslint would otherwise also load the
  // parent's .eslintrc.js and fail with duplicate plugin resolution.
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    'prefer-const': 'error',
    'no-var': 'error'
  },
  env: {
    node: true,
    jest: true,
    es6: true
  },
  ignorePatterns: [
    'dist/',
    'dist-bin/',
    'build/',
    'node_modules/',
    'coverage/',
    '*.js'
  ]
};
