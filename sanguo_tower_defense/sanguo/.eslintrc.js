module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    // 代码风格
    'indent': ['error', 4],
    'semi': ['error', 'always'],
    'quotes': ['error', 'double'],
    'brace-style': ['error', 'stroustrup'], // stroustrup风格：else/else if 单独占一行
    'comma-spacing': ['error', { 'before': false, 'after': true }],
    'space-before-blocks': ['error', 'always'],
    'space-before-function-paren': ['error', {
      'anonymous': 'always',
      'named': 'never',
      'asyncArrow': 'always'
    }],
    'arrow-spacing': ['error', { 'before': true, 'after': true }],
    'key-spacing': ['error', { 'beforeColon': false, 'afterColon': true }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'computed-property-spacing': ['error', 'never'],
    'template-curly-spacing': ['error', 'never'],
    'no-multi-spaces': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    
    // 命名规范
    '@typescript-eslint/naming-convention': [
      'error',
      {
        'selector': 'class',
        'format': ['PascalCase']
      },
      {
        'selector': 'interface',
        'format': ['PascalCase']
      },
      {
        'selector': 'typeAlias',
        'format': ['PascalCase']
      },
      {
        'selector': 'enum',
        'format': ['PascalCase']
      },
      {
        'selector': 'enumMember',
        'format': ['UPPER_CASE']
      },
      {
        'selector': 'variable',
        'format': ['camelCase', 'UPPER_CASE']
      },
      {
        'selector': 'function',
        'format': ['camelCase']
      },
      {
        'selector': 'method',
        'format': ['camelCase']
      },
      {
        'selector': 'parameter',
        'format': ['camelCase']
      },
      {
        'selector': 'property',
        'format': ['camelCase']
      },
      {
        'selector': 'memberLike',
        'modifiers': ['private'],
        'format': ['camelCase'],
        'leadingUnderscore': 'require'
      }
    ],
    
    // TypeScript 相关规则
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': ['warn'],
    '@typescript-eslint/explicit-function-return-type': ['warn'],
    '@typescript-eslint/explicit-member-accessibility': ['error', {
      'accessibility': 'explicit',
      'overrides': {
        'constructors': 'no-public'
      }
    }],
    '@typescript-eslint/no-non-null-assertion': ['warn'],
    '@typescript-eslint/consistent-type-imports': ['error', {
      'prefer': 'type-imports',
      'disallowTypeAnnotations': true
    }],
    '@typescript-eslint/no-inferrable-types': ['off'],
    
    // 其他规则
    'no-console': ['warn', { 'allow': ['warn', 'error', 'log'] }],
    'no-debugger': 'error',
    'eqeqeq': ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'no-useless-escape': 'warn',
    'no-mixed-spaces-and-tabs': 'error',
    'no-unreachable': 'error',
    'no-undef': 'off'
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.creator/',
    'temp/',
    '*.json',
    '*.md',
    '*.ejs',
    '*.html'
  ]
};
