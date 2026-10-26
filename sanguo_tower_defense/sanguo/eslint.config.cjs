const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const js = require('@eslint/js');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['node_modules/', 'dist/', '.creator/', 'temp/', '*.json', '*.md', '*.ejs', '*.html'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: {
      console: 'readonly',
      window: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      setInterval: 'readonly',
      clearInterval: 'readonly',
      document: 'readonly',
      location: 'readonly',
      navigator: 'readonly',
      pako: 'readonly',
      Image: 'readonly',
      JSZip: 'readonly',
      // 测试框架全局变量
      describe: 'readonly',
      it: 'readonly',
      expect: 'readonly',
    },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': unusedImports,
    },
    rules: {
      ...js.configs.recommended.rules,
      // 代码风格
      'indent': ['error', 4, {
        'SwitchCase': 1,
        'VariableDeclarator': 1,
        'outerIIFEBody': 1,
        'MemberExpression': 1,
        'FunctionDeclaration': { 'parameters': 1, 'body': 1 },
        'FunctionExpression': { 'parameters': 1, 'body': 1 },
        'CallExpression': { 'arguments': 1 },
        'ArrayExpression': 1,
        'ObjectExpression': 1,
        'ImportDeclaration': 1,
        'flatTernaryExpressions': false,
        'ignoreComments': false,
        'ignoredNodes': [
          'PropertyDefinition[decorators]',
          'PropertyDefinition[decorators] > *',
          'FunctionExpression > .params[decorators.length > 0]',
          'FunctionExpression > .params > :matches(Decorator, :not(:first-child))',
          'ClassBody.body > PropertyDefinition[decorators.length > 0] > .key',
          'TSTypeParameterInstantiation',
          'TemplateLiteral *',
          'JSXElement',
          'JSXElement > *',
          'JSXAttribute',
          'JSXIdentifier',
          'JSXNamespacedName',
          'JSXMemberExpression',
          'JSXSpreadAttribute',
          'JSXExpressionContainer',
          'JSXOpeningElement',
          'JSXClosingElement',
          'JSXFragment',
          'JSXOpeningFragment',
          'JSXClosingFragment',
          'JSXText',
          'JSXEmptyExpression',
          'JSXSpreadChild'
        ],
        'offsetTernaryExpressions': true
      }],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
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
        'off',
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
          'format': ['UPPER_CASE', 'camelCase', 'PascalCase']
        },
        {
          'selector': 'variable',
          'format': ['camelCase', 'UPPER_CASE', 'snake_case']
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
          'format': ['camelCase'],
          'leadingUnderscore': 'allow'
        },
        {
          'selector': 'classProperty',
          'modifiers': ['private'],
          'format': ['camelCase'],
          'leadingUnderscore': 'allow'
        },
        {          'selector': 'classProperty',          'modifiers': ['private', 'static'],          'format': ['camelCase', 'PascalCase'],          'leadingUnderscore': 'allow'        },
        {
          'selector': 'classProperty',
          'modifiers': ['protected'],
          'format': ['camelCase', 'snake_case'],
          'leadingUnderscore': 'allow'
        }
      ],
      
      // 基础规则
      'no-unused-vars': 'off',
      
      // TypeScript 相关规则
      '@typescript-eslint/no-unused-vars': 'off',
      
      // 未使用的 import 自动删除
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': ['off'],
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        'allowExpressions': true,
        'allowTypedFunctionExpressions': true,
        'allowHigherOrderFunctions': true,
        'allowDirectConstAssertionInArrowFunctions': true,
        'allowConciseArrowFunctionExpressionsStartingWithVoid': true,
        'allowFunctionsWithoutTypeParameters': true
      }],
      '@typescript-eslint/explicit-member-accessibility': ['error', {
        'accessibility': 'explicit',
        'overrides': {
          'constructors': 'no-public',
          'properties': 'no-public',
          'methods': 'no-public',
          'accessors': 'no-public'
        }
      }],
      '@typescript-eslint/no-non-null-assertion': ['off'],
      '@typescript-eslint/consistent-type-imports': ['off'],
      '@typescript-eslint/no-inferrable-types': ['off'],
      
      // 其他规则
      'no-async-promise-executor': 'off',
      'no-console': 'off',
      'no-debugger': 'error',
      'eqeqeq': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-arrow-callback': 'error',
      'no-case-declarations': 'off',
      'no-duplicate-case': 'off',
      'no-fallthrough': 'off',
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
      'no-mixed-spaces-and-tabs': 'error',
      'no-unreachable': 'error',
      'no-prototype-builtins': 'off',
      'no-undef': 'off'
    },
  },
];
