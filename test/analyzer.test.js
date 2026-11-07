// test/analyzer.test.js
const path = require('path');
const { analyzeProject } = require('../src/analyzer');
const { calculateScoreAndSavings } = require('../src/scorer');
const { removeUnused } = require('../src/remover');

describe('analyzer - Project Fixtures', () => {
  test('clean-project has 100/100 score and no unused or missing packages', () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'clean-project');
    const result = analyzeProject(fixtureDir);
    const scoreData = calculateScoreAndSavings(result);

    expect(result.used.has('express')).toBe(true);
    expect(result.unused).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.probablyUnused).toHaveLength(0);
    expect(scoreData.score).toBe(100);
    expect(scoreData.letterGrade).toBe('A+');
  });

  test('messy-project identifies unused, missing, and ignored packages correctly', () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'messy-project');
    const result = analyzeProject(fixtureDir);

    // express is used
    expect(result.used.has('express')).toBe(true);

    // moment is in .helpforbegsignore, so it is treated as used
    expect(result.used.has('moment')).toBe(true);
    expect(result.used.get('moment').reasons).toContain('Listed in .helpforbegsignore');

    // lodash is installed but never imported
    const unusedNames = result.unused.map((u) => u.name);
    expect(unusedNames).toContain('lodash');

    // axios was imported in index.js but never installed
    const missingNames = result.missing.map((m) => m.name);
    expect(missingNames).toContain('axios');

    // eslint is in devDependencies and in the safe list, but has no script
    const probablyNames = result.probablyUnused.map((p) => p.name);
    expect(probablyNames).toContain('eslint');
  });

  test('typescript-project correctly tracks types, built-in types, and ignores path aliases', () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'typescript-project');
    const result = analyzeProject(fixtureDir);

    expect(result.used.has('express')).toBe(true);
    expect(result.used.has('@types/express')).toBe(true);
    expect(result.used.has('@types/node')).toBe(true);

    // Path alias '@/utils' must never be reported as missing
    const missingNames = result.missing.map((m) => m.name);
    expect(missingNames).not.toContain('@/utils');
    expect(missingNames).not.toContain('utils');
    expect(missingNames).toHaveLength(0);
  });

  test('esm-project correctly parses ES modules, re-exports, and dynamic imports', () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'esm-project');
    const result = analyzeProject(fixtureDir);

    expect(result.used.has('chalk')).toBe(true);
    expect(result.used.has('mysql2')).toBe(true);

    // dynamic import of @babel/parser is reported missing
    const missingNames = result.missing.map((m) => m.name);
    expect(missingNames).toContain('@babel/parser');
  });

  test('monorepo-project merges workspace packages and prevents false missing alerts', () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'monorepo-project');
    const result = analyzeProject(fixtureDir);

    expect(result.isMonorepo).toBe(true);
    expect(result.workspacesCount).toBe(2);

    // root script references jest
    expect(result.used.has('jest')).toBe(true);

    // pkg-a uses lodash
    expect(result.used.has('lodash')).toBe(true);

    // pkg-b references @mono/pkg-a; it is a workspace package, so never reported as missing
    const missingNames = result.missing.map((m) => m.name);
    expect(missingNames).not.toContain('@mono/pkg-a');

    // cors was installed in pkg-b but never imported
    const unusedNames = result.unused.map((u) => u.name);
    expect(unusedNames).toContain('cors');
  });

  test('remover --dry-run previews actions without mutating files', async () => {
    const fixtureDir = path.join(__dirname, 'fixtures', 'messy-project');
    const exitCode = await removeUnused(fixtureDir, { dryRun: true, noColor: true });
    expect(exitCode).toBe(0);
  });
});
