// test/configReader.test.js
const path = require('path');
const {
  readJsonWithComments,
  extractPathAliases,
  readIgnoreFile,
  scanConfigFiles,
  checkDotenvInScripts,
} = require('../src/configReader');

describe('configReader', () => {
  const tsFixtureDir = path.join(__dirname, 'fixtures', 'typescript-project');
  const messyFixtureDir = path.join(__dirname, 'fixtures', 'messy-project');

  test('extracts path aliases from tsconfig.json', () => {
    const aliases = extractPathAliases(tsFixtureDir);
    expect(aliases.has('@')).toBe(true);
  });

  test('reads .helpforbegsignore and ignores comments and blank lines', () => {
    const ignored = readIgnoreFile(messyFixtureDir);
    expect(ignored.has('moment')).toBe(true);
    expect(ignored.has('# User ignored packages')).toBe(false);
  });

  test('detects -r dotenv/config in scripts', () => {
    expect(checkDotenvInScripts({ dev: 'nodemon server.js -r dotenv/config' })).toBe(true);
    expect(checkDotenvInScripts({ start: 'node --require dotenv/config index.js' })).toBe(true);
    expect(checkDotenvInScripts({ test: 'jest' })).toBe(false);
  });

  test('scans tsconfig compilerOptions.types', () => {
    const { usedPackages, hasTsConfig } = scanConfigFiles(tsFixtureDir);
    expect(hasTsConfig).toBe(true);
    expect(usedPackages.has('@types/node')).toBe(true);
  });
});
