// src/reporter.js
// WHY: A good CLI should feel friendly, readable, and encouraging.
// We format findings with clean indentation, gentle colors, and clear emojis.
// When piped or run in CI, colors are stripped automatically so logs stay crisp.

const chalk = require('chalk');
const { NORMAL_MESSAGES, ROAST_MESSAGES } = require('./messages');

/**
 * Creates a color wrapper that respects the user's --no-color setting and environment.
 *
 * @param {boolean} noColor
 */
function createStyler(noColor) {
  if (noColor) {
    const identity = (str) => String(str);
    return {
      bold: identity,
      dim: identity,
      red: identity,
      yellow: identity,
      green: identity,
      cyan: identity,
      gray: identity,
    };
  }
  return chalk;
}

/**
 * Formats and prints the complete CLI report to stdout.
 *
 * @param {object} analysis - Result from analyzer.analyzeProject
 * @param {object} scoreData - Result from scorer.calculateScoreAndSavings
 * @param {object} [options]
 * @param {boolean} [options.roast=false]
 * @param {boolean} [options.noColor=false]
 * @param {boolean} [options.json=false]
 * @param {boolean} [options.scoreOnly=false]
 * @returns {number} The recommended process exit code (0 = clean, 1 = issues found)
 */
function reportResults(analysis, scoreData, options = {}) {
  const isRoast = Boolean(options.roast);
  const msgBundle = isRoast ? ROAST_MESSAGES : NORMAL_MESSAGES;
  const styler = createStyler(options.noColor);

  // 1. JSON mode: output raw structured data for scripts and tools
  if (options.json) {
    const output = {
      project: analysis.rootPkgJson.name || 'unnamed-project',
      version: analysis.rootPkgJson.version || '1.0.0',
      filesScanned: analysis.filesReadCount,
      isMonorepo: analysis.isMonorepo,
      workspacesCount: analysis.workspacesCount,
      missingNodeModules: analysis.missingNodeModules,
      health: {
        score: scoreData.score,
        letterGrade: scoreData.letterGrade,
        comment: scoreData.comment,
        potentialSavingsBytes: scoreData.totalBytesSaved,
        potentialSavingsFormatted: scoreData.formattedSpaceSaved,
      },
      unused: scoreData.sizedUnused.map((u) => ({
        name: u.name,
        isDev: u.isDev,
        sizeBytes: u.bytes,
        formattedSize: u.formattedSize,
        reason: u.reason,
      })),
      probablyUnused: analysis.probablyUnused,
      missing: analysis.missing,
      usedCount: analysis.used.size,
      skippedLargeFiles: analysis.skippedLargeFiles,
      parseWarnings: analysis.parseWarnings,
    };

    console.log(JSON.stringify(output, null, 2));
    const hasIssues = scoreData.sizedUnused.length > 0 || analysis.missing.length > 0 || analysis.probablyUnused.length > 0;
    return hasIssues ? 1 : 0;
  }

  // 2. Score-only mode: `helpforbegs score`
  if (options.scoreOnly) {
    console.log(
      styler.bold(
        msgBundle.scoreLabel(scoreData.score, scoreData.letterGrade, scoreData.comment)
      )
    );
    const hasIssues = scoreData.sizedUnused.length > 0 || analysis.missing.length > 0 || analysis.probablyUnused.length > 0;
    return hasIssues ? 1 : 0;
  }

  // 3. Full human-friendly report:
  console.log();
  console.log(styler.cyan(msgBundle.scanHeader(analysis.filesReadCount)));

  // Monorepo notice
  if (analysis.isMonorepo) {
    console.log(styler.dim(`  ${msgBundle.monorepoNotice(analysis.workspacesCount)}`));
  }

  // Missing node_modules warning
  if (analysis.missingNodeModules) {
    console.log(styler.yellow(`  ${msgBundle.missingNodeModulesNotice}`));
  }

  // Skipped large files
  for (const skipped of analysis.skippedLargeFiles) {
    const sizeMb = (skipped.size / (1024 * 1024)).toFixed(1);
    console.log(styler.gray(`  ${msgBundle.largeFileSkipped(skipped.relativePath, sizeMb)}`));
  }

  // Parse warnings
  for (const warning of analysis.parseWarnings) {
    console.log(styler.gray(`  ${msgBundle.parseWarning(warning)}`));
  }

  console.log();

  // Section: Unused packages
  if (scoreData.sizedUnused.length > 0) {
    console.log(styler.red(styler.bold(msgBundle.unusedHeader(scoreData.sizedUnused.length))));
    for (const item of scoreData.sizedUnused) {
      const sizeTag = item.bytes > 0 ? styler.gray(`(${item.formattedSize})`.padEnd(10)) : ''.padEnd(10);
      const pkgFormatted = styler.bold(item.name.padEnd(14));
      const message = msgBundle.unusedItem(item.name, item.reason);
      console.log(`   • ${pkgFormatted} ${sizeTag}  ${message}`);
    }
    console.log();
  }

  // Section: Probably unused
  if (analysis.probablyUnused.length > 0) {
    console.log(styler.yellow(styler.bold(msgBundle.probablyHeader(analysis.probablyUnused.length))));
    for (const item of analysis.probablyUnused) {
      const pkgFormatted = styler.bold(item.name.padEnd(14));
      const message = msgBundle.probablyItem(item.name, item.reason);
      console.log(`   • ${pkgFormatted}  ${message}`);
    }
    console.log();
  }

  // Section: Missing packages
  if (analysis.missing.length > 0) {
    console.log(styler.red(styler.bold(msgBundle.missingHeader(analysis.missing.length))));
    for (const item of analysis.missing) {
      const pkgFormatted = styler.bold(item.name.padEnd(14));
      const firstLoc = item.locations[0] || { file: 'unknown', line: 1 };
      const message = msgBundle.missingItem(item.name, firstLoc);
      console.log(`   • ${pkgFormatted}  ${message}`);
    }
    console.log();
  }

  // Section: Used packages count
  if (analysis.used.size > 0) {
    console.log(styler.green(msgBundle.usedHeader(analysis.used.size)));
    console.log();
  }

  // Section: Health Score & Potential Disk Space Saved
  console.log(styler.bold(msgBundle.scoreLabel(scoreData.score, scoreData.letterGrade, scoreData.comment)));
  if (scoreData.totalBytesSaved > 0) {
    console.log(styler.cyan(msgBundle.spaceSaved(scoreData.formattedSpaceSaved)));
  }

  console.log();

  // Recommendations
  if (scoreData.sizedUnused.length > 0) {
    console.log(styler.dim(msgBundle.runRemoveTip));
  } else if (analysis.missing.length === 0 && analysis.probablyUnused.length === 0) {
    console.log(styler.green(msgBundle.cleanAllGood));
  }

  console.log();

  // Exit code: 0 if clean, 1 if any unused, missing, or probablyUnused items exist
  const hasIssues = scoreData.sizedUnused.length > 0 || analysis.missing.length > 0 || analysis.probablyUnused.length > 0;
  return hasIssues ? 1 : 0;
}

module.exports = {
  reportResults,
  createStyler,
};
