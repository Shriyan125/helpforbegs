// src/configReader.js
// WHY: Packages don't just live in require() or import statements.
// Many critical packages are declared inside configuration files (ESLint plugins,
// Babel presets, Prettier plugins, tsconfig compiler types, and peerDependencies).
// Scanning configs ensures beginners never accidentally uninstall tools their configs rely on.

const fs = require('fs');
const path = require('path');

/**
 * Safely parses JSON files, stripping single-line and multi-line comments
 * which are common in JSONC files like tsconfig.json and .eslintrc.
 *
 * @param {string} filePath
 * @returns {any|null}
 */
function readJsonWithComments(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Remove single-line comments (//...) and multi-line comments (/*...*/)
    const cleanJson = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    return JSON.parse(cleanJson);
  } catch {
    return null;
  }
}

/**
 * Extracts custom path aliases from tsconfig.json / jsconfig.json and package.json imports.
 * e.g. "@/*" -> "@", "~/components/*" -> "~"
 *
 * @param {string} projectDir
 * @param {object} [pkgJson]
 * @returns {Set<string>}
 */
function extractPathAliases(projectDir, pkgJson = {}) {
  const aliases = new Set();

  // 1. From tsconfig.json or jsconfig.json
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const jsconfigPath = path.join(projectDir, 'jsconfig.json');

  const config = readJsonWithComments(tsconfigPath) || readJsonWithComments(jsconfigPath);
  if (config && config.compilerOptions && config.compilerOptions.paths) {
    for (const pattern of Object.keys(config.compilerOptions.paths)) {
      // e.g. "@/*" -> "@", "utils/*" -> "utils"
      const clean = pattern.replace(/\/\*$/, '').replace(/\*$/, '');
      if (clean) {
        aliases.add(clean);
      }
    }
  }

  // 2. From package.json "imports" field (Node.js subpath imports like "#internal/*")
  if (pkgJson && pkgJson.imports && typeof pkgJson.imports === 'object') {
    for (const key of Object.keys(pkgJson.imports)) {
      const clean = key.replace(/\/\*$/, '').replace(/\*$/, '');
      if (clean) {
        aliases.add(clean);
      }
    }
  }

  return aliases;
}

/**
 * Reads the user's .helpforbegsignore file if present.
 * Lines starting with # are comments.
 *
 * @param {string} projectDir
 * @returns {Set<string>}
 */
function readIgnoreFile(projectDir) {
  const ignoreFilePath = path.join(projectDir, '.helpforbegsignore');
  const ignored = new Set();

  if (!fs.existsSync(ignoreFilePath)) {
    return ignored;
  }

  try {
    const content = fs.readFileSync(ignoreFilePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      ignored.add(line);
    }
  } catch {
    // Ignore read errors
  }

  return ignored;
}

/**
 * Reads node_modules to find all peerDependencies declared by installed packages.
 *
 * @param {string} projectDir
 * @returns {Set<string>}
 */
function collectPeerDependencies(projectDir) {
  const peers = new Set();
  const nodeModulesPath = path.join(projectDir, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    return peers;
  }

  function readPeers(pkgJsonPath) {
    try {
      if (fs.existsSync(pkgJsonPath)) {
        const data = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (data.peerDependencies && typeof data.peerDependencies === 'object') {
          for (const peerName of Object.keys(data.peerDependencies)) {
            peers.add(peerName);
          }
        }
      }
    } catch {
      // Ignore unparseable files
    }
  }

  try {
    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith('@')) {
        const scopePath = path.join(nodeModulesPath, entry.name);
        try {
          const scopedEntries = fs.readdirSync(scopePath, { withFileTypes: true });
          for (const scoped of scopedEntries) {
            if (scoped.isDirectory()) {
              readPeers(path.join(scopePath, scoped.name, 'package.json'));
            }
          }
        } catch {
          // Skip unreadable scope
        }
      } else if (!entry.name.startsWith('.')) {
        readPeers(path.join(nodeModulesPath, entry.name, 'package.json'));
      }
    }
  } catch {
    return peers;
  }

  return peers;
}

/**
 * Scans ESLint, Prettier, Babel, PostCSS, and TypeScript configuration files
 * for declared packages, plugins, presets, and extends.
 *
 * @param {string} projectDir
 * @returns {{ usedPackages: Set<string>, hasTsConfig: boolean }}
 */
function scanConfigFiles(projectDir) {
  const usedPackages = new Set();
  let hasTsConfig = false;

  // 1. TypeScript tsconfig.json / jsconfig.json
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    hasTsConfig = true;
    const tsconfig = readJsonWithComments(tsconfigPath);
    if (tsconfig) {
      // Extends: e.g. "@tsconfig/node18/tsconfig.json" -> "@tsconfig/node18"
      if (typeof tsconfig.extends === 'string') {
        const ext = tsconfig.extends;
        if (!ext.startsWith('.')) {
          const parts = ext.split('/');
          const pkg = ext.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
          usedPackages.add(pkg);
        }
      }

      // Types: e.g. ["jest", "node"] -> "@types/jest", "@types/node"
      if (tsconfig.compilerOptions && Array.isArray(tsconfig.compilerOptions.types)) {
        for (const typeItem of tsconfig.compilerOptions.types) {
          usedPackages.add(typeItem);
          usedPackages.add(`@types/${typeItem}`);
        }
      }
    }
  }

  // 2. ESLint configs (.eslintrc, .eslintrc.json, .eslintrc.js, etc.)
  const eslintFiles = [
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
  ];

  for (const name of eslintFiles) {
    const fullPath = path.join(projectDir, name);
    if (!fs.existsSync(fullPath)) continue;

    // For JS configs, they will also be parsed by fileFinder + astParser,
    // but reading the raw text or JSON captures plugin strings too
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const json = name.endsWith('.json') || name === '.eslintrc' ? readJsonWithComments(fullPath) : null;

      if (json) {
        // Handle extends
        const rawExtends = Array.isArray(json.extends) ? json.extends : [json.extends].filter(Boolean);
        for (const ext of rawExtends) {
          if (typeof ext !== 'string') continue;
          if (ext.startsWith('plugin:')) {
            const pluginPart = ext.slice('plugin:'.length).split('/')[0];
            if (pluginPart.startsWith('@')) {
              usedPackages.add(`${pluginPart}/eslint-plugin`);
            } else {
              usedPackages.add(`eslint-plugin-${pluginPart}`);
            }
          } else if (!ext.startsWith('eslint:') && !ext.startsWith('.')) {
            // e.g. "airbnb" -> "eslint-config-airbnb", "prettier" -> "eslint-config-prettier"
            if (!ext.startsWith('eslint-config-') && !ext.includes('/')) {
              usedPackages.add(`eslint-config-${ext}`);
            } else {
              usedPackages.add(ext);
            }
          }
        }

        // Handle plugins: e.g. ["react", "@typescript-eslint"]
        if (Array.isArray(json.plugins)) {
          for (const plugin of json.plugins) {
            if (typeof plugin !== 'string') continue;
            if (plugin.startsWith('@')) {
              usedPackages.add(`${plugin}/eslint-plugin`);
            } else if (!plugin.startsWith('eslint-plugin-')) {
              usedPackages.add(`eslint-plugin-${plugin}`);
            } else {
              usedPackages.add(plugin);
            }
          }
        }
      } else {
        // Regex search for plugin/config package names inside JS/YAML eslint configs
        const pluginRegex = /['"`](eslint-(?:config|plugin)-[^'"`]+|@[^'"`]+\/eslint-(?:config|plugin)[^'"`]*)['"`]/g;
        let match;
        while ((match = pluginRegex.exec(content)) !== null) {
          usedPackages.add(match[1]);
        }
      }
    } catch {
      // Ignore config read errors
    }
  }

  // 3. Babel configs (.babelrc, babel.config.json, babel.config.js)
  const babelFiles = ['.babelrc', '.babelrc.json', 'babel.config.json', 'babel.config.js'];
  for (const name of babelFiles) {
    const fullPath = path.join(projectDir, name);
    if (!fs.existsSync(fullPath)) continue;

    const json = readJsonWithComments(fullPath);
    if (json) {
      const presets = Array.isArray(json.presets) ? json.presets : [];
      for (const preset of presets) {
        const presetName = Array.isArray(preset) ? preset[0] : preset;
        if (typeof presetName === 'string') {
          if (presetName.startsWith('@')) {
            usedPackages.add(presetName);
          } else if (!presetName.startsWith('babel-preset-') && !presetName.startsWith('.')) {
            usedPackages.add(`babel-preset-${presetName}`);
          } else {
            usedPackages.add(presetName);
          }
        }
      }

      const plugins = Array.isArray(json.plugins) ? json.plugins : [];
      for (const plugin of plugins) {
        const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
        if (typeof pluginName === 'string') {
          if (pluginName.startsWith('@')) {
            usedPackages.add(pluginName);
          } else if (!pluginName.startsWith('babel-plugin-') && !pluginName.startsWith('.')) {
            usedPackages.add(`babel-plugin-${pluginName}`);
          } else {
            usedPackages.add(pluginName);
          }
        }
      }
    }
  }

  // 4. Prettier configs (.prettierrc, .prettierrc.json)
  const prettierFiles = ['.prettierrc', '.prettierrc.json'];
  for (const name of prettierFiles) {
    const fullPath = path.join(projectDir, name);
    if (!fs.existsSync(fullPath)) continue;
    const json = readJsonWithComments(fullPath);
    if (json && Array.isArray(json.plugins)) {
      for (const plug of json.plugins) {
        if (typeof plug === 'string') {
          usedPackages.add(plug);
        }
      }
    }
  }

  return {
    usedPackages,
    hasTsConfig,
  };
}

/**
 * Checks whether dotenv is invoked via CLI flags in package.json scripts
 * e.g. "-r dotenv/config" or "node --require dotenv/config app.js"
 *
 * @param {Record<string, string>} scripts
 * @returns {boolean}
 */
function checkDotenvInScripts(scripts = {}) {
  const dotenvFlagRegex = /(?:-r|--require)\s+dotenv(?:\/config)?/;
  for (const cmd of Object.values(scripts)) {
    if (typeof cmd === 'string' && dotenvFlagRegex.test(cmd)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  readJsonWithComments,
  extractPathAliases,
  readIgnoreFile,
  collectPeerDependencies,
  scanConfigFiles,
  checkDotenvInScripts,
};
