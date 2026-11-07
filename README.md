# helpforbegs

> **Dependency help for beginners. No jargon, just plain English.**

A gentle, accurate command-line assistant that scans your Node.js project and tells you:
- Which packages you installed but never use.
- Which packages you use in your code but forgot to install.
- How much lighter and cleaner your project will be after cleaning up.

Zero build steps. Zero TypeScript compilation needed. Safe by default.

---

## 📸 Demo Output

```text
🔍 Scanning your project... (42 files read)

❌ Installed but never used (2)
   • lodash   (1.4 MB)  You installed lodash but never used it.
   • moment   (4.2 MB)  You installed moment but never used it.

🤔 Probably unused (1)
   • cors     Known development tool, but no active script or config reference was detected

⚠️  Used but not installed (1)
   • axios    Used in src/api.js:3 but missing from package.json.

✅ 9 packages are used correctly

📊 Health score: 78/100 (B) "Pretty tidy, a few dusty corners."
💾 You could free about 5.6 MB.

💡 Run `npx helpforbegs remove` to clean up safely.
```

---

## ⚡ Quick Start

You don't even need to install it permanently! Just run `npx` inside any Node.js project:

```bash
npx helpforbegs
```

Or install it globally if you want to use it anytime:

```bash
npm install -g helpforbegs
helpforbegs
```

---

## 🛠️ Commands

| Command | What it does |
|---|---|
| `helpforbegs` or `helpforbegs scan` | Runs a complete project scan and prints the friendly health report. |
| `helpforbegs remove` | Displays unused packages, prompts for confirmation (`y/N`), creates a timestamped backup of `package.json`, and safely uninstalls them. |
| `helpforbegs why <package>` | Explains in plain English with exact file paths and line numbers where a package is used, or why it is considered unused. |
| `helpforbegs score` | Prints only the project health score, letter grade, and summary comment (great for CI or quick checks). |

---

## 🚩 Flags & Options

- `--path <dir>`: Scan another folder instead of the current directory (e.g. `npx helpforbegs --path ../my-express-app`).
- `--dry-run`: Test `helpforbegs remove` safely without touching or deleting any files.
- `--yes` or `-y`: Automatically confirm uninstallation in `remove` mode (required in CI or non-interactive terminals).
- `--roast`: Enable humorous, playfully sarcastic feedback on your dependency habits.
- `--json`: Output raw JSON data for CI pipelines, scripts, or custom dashboards.
- `--no-color`: Disable all ANSI terminal colors (automatically respected if `NO_COLOR` is set or when output is redirected to a file).
- `--help` (`-h`): Display the CLI help screen.
- `--version` (`-v`): Show the installed version.
- `--debug`: Display full technical stack traces on unexpected errors.

---

## 🧠 How Detection Works (In Plain English)

Many tools use simple text searches or regular expressions to find package names, which often leads to mistakes. `helpforbegs` works differently:

1. **Real AST Code Parsing**: We parse your JavaScript and TypeScript files using `@babel/parser`. This means we inspect the actual syntax tree of your code. We recognize:
   - CommonJS `require('pkg')` and `require.resolve('pkg')`
   - ES Module `import ... from 'pkg'`, `import 'pkg'`, and `export ... from 'pkg'`
   - Dynamic `import('pkg')`
   - TypeScript `import type { ... } from 'pkg'`
2. **Package Name Normalization**: We strip subpaths (`lodash/fp` $\rightarrow$ `lodash`, `@babel/parser/lib` $\rightarrow$ `@babel/parser`), ignore relative paths (`./utils`), and filter out Node.js built-ins (`fs`, `path`, `node:test`, `crypto`).
3. **Path Alias Intelligence**: We read path aliases in `tsconfig.json`, `jsconfig.json` (`compilerOptions.paths`), and `package.json` (`imports`). Imports like `@/components/Button` or `~/helpers` are recognized as internal aliases and are never flagged as missing npm packages.
4. **Script Execution (`bin` commands)**: When you install CLI packages like `nodemon` or `rimraf`, you don't `require` them in code—you run them in `package.json` scripts. We read the `bin` field of packages in `node_modules` and match them against your script commands.
5. **Config Files**: We check ESLint configs, Prettier plugins, Babel presets, Tailwind, PostCSS, and `tsconfig.json` compiler types.
6. **Peer Dependencies**: If another installed package requires a dependency as a `peerDependency`, we will never mark it as unused.
7. **Safe-List for Dev Tools**: Common development tools (`typescript`, `eslint`, `prettier`, `jest`, `nodemon`, `husky`, etc.) are recognized so you aren't pressured to delete your build pipeline.
8. **Special Dotenv Rule**: `dotenv` is only flagged as unused if it is neither imported in code nor passed as a `-r dotenv/config` flag in scripts.

---

## 🛡️ Why You Can Trust the Results

False positives are dangerous: telling a beginner to uninstall a required package could break their project.

`helpforbegs` follows strict safety rules:
1. **Never guess when unsure**: When confidence is not 100%, packages are marked `"Probably unused"` with an explanation to double-check, and `helpforbegs remove` will never delete them automatically.
2. **Timestamped backups**: Before modifying `package.json`, a backup named `package.json.helpforbegs.<timestamp>.bak` is created.
3. **Respects your package manager**: Automatically detects whether you use `npm`, `yarn`, `pnpm`, or `bun` by checking lockfiles, so your lockfile stays consistent.
4. **Large files protection**: Skips files larger than 1 MB to prevent memory bloat, and informs you in the report.
5. **Graceful syntax recovery**: If a file contains syntax errors that fail AST parsing, it falls back to a regex scanner and notes: `"Could not fully read src/x.js"`.

---

## 🙈 Ignoring Packages (`.helpforbegsignore`)

If you have a package that is used in a way automated tools cannot see, create a `.helpforbegsignore` file in your project root:

```text
# .helpforbegsignore
# Packages listed here will never be flagged as unused

cors
dotenv
```

---

## ⚠️ Known Limitations

1. **Dynamic require variables**: Expressions like `require(myVariableName)` cannot be statically analyzed because their value is only known while your app is running.
2. **Shell scripts outside package.json**: Tools invoked exclusively inside custom `.sh` or `.bat` files outside `package.json` scripts won't be seen unless listed in `.helpforbegsignore`.
3. **Code generated at runtime**: Dynamically evaluated code (e.g. `eval()` or code fetched over a network) cannot be scanned statically.

---

## 🤝 Contributing

Contributions are welcome!
1. Fork the repository.
2. Clone your fork and run `npm install`.
3. Run tests with `npm test`.
4. Submit a Pull Request.

---

## 📄 License

MIT © helpforbegs contributors
# helpforbegs
