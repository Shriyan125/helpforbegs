// test/astParser.test.js
const { parseImports, normalizePackageName } = require('../src/astParser');

describe('astParser - Normalization', () => {
  test('normalizes standard packages and deep subpaths', () => {
    expect(normalizePackageName('lodash')).toBe('lodash');
    expect(normalizePackageName('lodash/debounce')).toBe('lodash');
    expect(normalizePackageName('lodash/fp/map')).toBe('lodash');
  });

  test('normalizes scoped packages and deep subpaths', () => {
    expect(normalizePackageName('@babel/parser')).toBe('@babel/parser');
    expect(normalizePackageName('@babel/parser/lib/index.js')).toBe('@babel/parser');
  });

  test('ignores relative paths and absolute paths', () => {
    expect(normalizePackageName('./utils')).toBeNull();
    expect(normalizePackageName('../models/User')).toBeNull();
    expect(normalizePackageName('/root/secret')).toBeNull();
  });

  test('ignores Node.js built-ins with or without node: prefix', () => {
    expect(normalizePackageName('fs')).toBeNull();
    expect(normalizePackageName('path')).toBeNull();
    expect(normalizePackageName('node:crypto')).toBeNull();
    expect(normalizePackageName('node:test')).toBeNull();
  });

  test('ignores framework path aliases', () => {
    expect(normalizePackageName('@/components/Button')).toBeNull();
    expect(normalizePackageName('~/helpers')).toBeNull();
    expect(normalizePackageName('#internal')).toBeNull();
  });

  test('ignores custom aliases configured in tsconfig', () => {
    const customAliases = new Set(['my-alias', '@shared']);
    expect(normalizePackageName('my-alias/Button', customAliases)).toBeNull();
    expect(normalizePackageName('@shared/models', customAliases)).toBeNull();
  });
});

describe('astParser - AST Extraction', () => {
  test('detects CommonJS require and require.resolve', () => {
    const code = `
      const express = require('express');
      const resolved = require.resolve('cors');
      const local = require('./local');
    `;
    const { imports } = parseImports(code, 'app.js');
    const names = imports.map((i) => i.packageName);
    expect(names).toContain('express');
    expect(names).toContain('cors');
    expect(names).not.toContain('./local');
  });

  test('detects ES Module static imports, dynamic imports, and re-exports', () => {
    const code = `
      import chalk from 'chalk';
      import 'dotenv/config';
      export { get } from 'lodash/get';
      export * from 'mysql2';
      async function run() {
        const mod = await import('axios');
      }
    `;
    const { imports } = parseImports(code, 'module.mjs');
    const names = imports.map((i) => i.packageName);
    expect(names).toEqual(['chalk', 'dotenv', 'lodash', 'mysql2', 'axios']);
  });

  test('detects TypeScript type-only imports and TSX syntax', () => {
    const code = `
      import React from 'react';
      import type { Request, Response } from 'express';
      export const View = () => <div className="box">Hello</div>;
    `;
    const { imports } = parseImports(code, 'View.tsx');
    expect(imports).toEqual([
      { packageName: 'react', rawSpecifier: 'react', line: 2, isTypeOnly: false },
      { packageName: 'express', rawSpecifier: 'express', line: 3, isTypeOnly: true },
    ]);
  });

  test('falls back to regex parser and emits warning when syntax is broken', () => {
    const brokenCode = `
      const foo = <<<< invalid syntax >>>>;
      const express = require('express');
      import validator from 'validator';
    `;
    const { imports, warning } = parseImports(brokenCode, 'broken.js');
    expect(warning).toContain('Could not fully read broken.js');
    const names = imports.map((i) => i.packageName);
    expect(names).toContain('express');
    expect(names).toContain('validator');
  });
});
