// src/astParser.js
// WHY: Regular expressions can be easily fooled by commented-out code
// or strings containing "require('foo')". Using @babel/parser ensures we
// inspect the real AST (Abstract Syntax Tree) with 100% syntactic precision.

const babelParser = require('@babel/parser');
const path = require('path');
const { scanWithRegex, normalizePackageName } = require('./fallbackParser');

/**
 * Determines the exact Babel plugins needed based on the file extension.
 *
 * Rule from user:
 * - .ts: ['typescript']
 * - .tsx: ['typescript', 'jsx']
 * - .js / .jsx / .mjs / .cjs: ['jsx']
 *
 * @param {string} ext - e.g. '.tsx'
 * @returns {string[]}
 */
function getBabelPlugins(ext) {
  const normalizedExt = (ext || '').toLowerCase();
  if (normalizedExt === '.ts') {
    return ['typescript'];
  }
  if (normalizedExt === '.tsx') {
    return ['typescript', 'jsx'];
  }
  return ['jsx'];
}

/**
 * Traverses an AST tree without needing an external walker library.
 *
 * @param {object} node - Current AST node
 * @param {(node: object) => void} visitor - Function called for each node
 */
function walkAST(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visitor(node);

  for (const key of Object.keys(node)) {
    // Avoid traversing parent references or metadata to prevent infinite loops
    if (key === 'loc' || key === 'comments' || key === 'tokens') {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') {
          walkAST(item, visitor);
        }
      }
    } else if (child && typeof child === 'object') {
      walkAST(child, visitor);
    }
  }
}

/**
 * Safely extracts a string value from an argument node.
 * Handles both plain 'string' literals and non-dynamic template literals like `pkg`.
 *
 * @param {object} argNode
 * @returns {string|null}
 */
function extractStringArgument(argNode) {
  if (!argNode) return null;
  if (argNode.type === 'StringLiteral') {
    return argNode.value;
  }
  if (argNode.type === 'TemplateLiteral' && argNode.expressions.length === 0 && argNode.quasis.length === 1) {
    return argNode.quasis[0].value.raw;
  }
  return null;
}

/**
 * Parses a code string into AST, extracts all imported/required package names,
 * and falls back to regex if the file has syntax errors.
 *
 * @param {string} code - Source code text
 * @param {string} filePath - Path to the file (used to decide plugins & line numbers)
 * @param {object} [options]
 * @param {Set<string>} [options.knownAliases] - Path aliases to ignore
 * @returns {{ imports: Array<{ packageName: string, rawSpecifier: string, line: number, isTypeOnly: boolean }>, warning: string|null }}
 */
function parseImports(code, filePath, options = {}) {
  const ext = path.extname(filePath);
  const plugins = getBabelPlugins(ext);
  const knownAliases = options.knownAliases || new Set();
  const rawImports = [];
  let warning = null;

  try {
    const ast = babelParser.parse(code, {
      sourceType: 'unambiguous', // Automatically detects CommonJS vs ES Modules
      plugins: plugins,
      errorRecovery: true, // Recovers from non-fatal syntax errors
      attachComment: false,
    });

    walkAST(ast, (node) => {
      // 1. Static ES Module Imports: `import foo from 'pkg'` or `import 'pkg'`
      if (node.type === 'ImportDeclaration') {
        if (node.source && typeof node.source.value === 'string') {
          const isTypeOnly = node.importKind === 'type';
          rawImports.push({
            rawSpecifier: node.source.value,
            line: node.loc ? node.loc.start.line : 1,
            isTypeOnly,
          });
        }
      }

      // 2. ES Module Re-exports: `export { x } from 'pkg'` or `export * from 'pkg'`
      else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
        if (node.source && typeof node.source.value === 'string') {
          const isTypeOnly = node.exportKind === 'type';
          rawImports.push({
            rawSpecifier: node.source.value,
            line: node.loc ? node.loc.start.line : 1,
            isTypeOnly,
          });
        }
      }

      // 3. CommonJS `require('pkg')`, `require.resolve('pkg')`, and dynamic `import('pkg')`
      else if (node.type === 'CallExpression') {
        // require('pkg')
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length > 0) {
          const specifier = extractStringArgument(node.arguments[0]);
          if (specifier) {
            rawImports.push({
              rawSpecifier: specifier,
              line: node.loc ? node.loc.start.line : 1,
              isTypeOnly: false,
            });
          }
        }

        // require.resolve('pkg')
        else if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'require' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'resolve' &&
          node.arguments.length > 0
        ) {
          const specifier = extractStringArgument(node.arguments[0]);
          if (specifier) {
            rawImports.push({
              rawSpecifier: specifier,
              line: node.loc ? node.loc.start.line : 1,
              isTypeOnly: false,
            });
          }
        }

        // Dynamic import('pkg')
        else if (node.callee.type === 'Import' && node.arguments.length > 0) {
          const specifier = extractStringArgument(node.arguments[0]);
          if (specifier) {
            rawImports.push({
              rawSpecifier: specifier,
              line: node.loc ? node.loc.start.line : 1,
              isTypeOnly: false,
            });
          }
        }
      }

      // 4. TypeScript `import foo = require('pkg')`
      else if (node.type === 'TSImportEqualsDeclaration') {
        if (
          node.moduleReference &&
          node.moduleReference.type === 'TSExternalModuleReference' &&
          node.moduleReference.expression &&
          typeof node.moduleReference.expression.value === 'string'
        ) {
          rawImports.push({
            rawSpecifier: node.moduleReference.expression.value,
            line: node.loc ? node.loc.start.line : 1,
            isTypeOnly: false,
          });
        }
      }
    });
  } catch (err) {
    // If AST parsing fails, use our safe fallback regex scanner for this file
    warning = `Could not fully read ${filePath}`;
    const fallbackResults = scanWithRegex(code, filePath, { knownAliases });
    return {
      imports: fallbackResults,
      warning,
    };
  }

  // Normalize all raw specifiers into npm package names
  const normalizedImports = [];
  for (const item of rawImports) {
    const packageName = normalizePackageName(item.rawSpecifier, knownAliases);
    if (packageName) {
      normalizedImports.push({
        packageName,
        rawSpecifier: item.rawSpecifier,
        line: item.line,
        isTypeOnly: item.isTypeOnly,
      });
    }
  }

  return {
    imports: normalizedImports,
    warning,
  };
}

module.exports = {
  parseImports,
  getBabelPlugins,
  normalizePackageName,
  walkAST,
};
