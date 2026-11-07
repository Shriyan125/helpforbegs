// src/scorer.js
// WHY: Numbers and grades give beginners immediate, intuitive feedback.
// Showing how much disk space can be saved (e.g. "Free about 5.6 MB")
// turns abstract dependency cleanup into a tangible, rewarding achievement.

const fs = require('fs');
const path = require('path');
const { NORMAL_MESSAGES, ROAST_MESSAGES } = require('./messages');

/**
 * Recursively calculates the byte size of a folder on disk.
 *
 * @param {string} dirPath
 * @returns {number} Size in bytes
 */
function getDirectorySize(dirPath) {
  let totalBytes = 0;

  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          totalBytes += getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const fileStat = fs.statSync(fullPath);
          totalBytes += fileStat.size;
        }
      } catch {
        // Skip unreadable files or broken symlinks
      }
    }
  } catch {
    return 0;
  }

  return totalBytes;
}

/**
 * Formats a byte number into a clean, human-readable string (KB or MB).
 *
 * @param {number} bytes
 * @returns {string} e.g. "1.4 MB" or "320 KB"
 */
function formatBytes(bytes) {
  if (bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1000) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Measures the install size of a package inside node_modules.
 *
 * @param {string} projectDir
 * @param {string} pkgName
 * @returns {number}
 */
function getPackageInstallSize(projectDir, pkgName) {
  const pkgPath = path.join(projectDir, 'node_modules', ...pkgName.split('/'));
  return getDirectorySize(pkgPath);
}

/**
 * Calculates health score, letter grade, and disk savings for an analyzed project.
 *
 * @param {object} analysis - Result from analyzer.analyzeProject
 * @param {object} [options]
 * @param {boolean} [options.roast=false]
 * @returns {object} Score and savings breakdown
 */
function calculateScoreAndSavings(analysis, options = {}) {
  const isRoast = Boolean(options.roast);
  const msgBundle = isRoast ? ROAST_MESSAGES : NORMAL_MESSAGES;

  const unusedCount = analysis.unused.length;
  const missingCount = analysis.missing.length;
  const probablyCount = analysis.probablyUnused.length;

  // Score deductions:
  // - Missing package: -15 (severe: app will crash at runtime)
  // - Unused package: -10 (wasted bloat and install time)
  // - Probably unused: -5 (minor uncertainty)
  let rawScore = 100 - (missingCount * 15) - (unusedCount * 10) - (probablyCount * 5);
  if (rawScore < 0) rawScore = 0;
  if (rawScore > 100) rawScore = 100;

  // Letter grades
  let letterGrade = 'A+';
  if (rawScore === 100) {
    letterGrade = 'A+';
  } else if (rawScore >= 90) {
    letterGrade = 'A';
  } else if (rawScore >= 80) {
    letterGrade = 'B';
  } else if (rawScore >= 70) {
    letterGrade = 'C';
  } else if (rawScore >= 60) {
    letterGrade = 'D';
  } else {
    letterGrade = 'F';
  }

  const comment = msgBundle.gradeComments[letterGrade];

  // Calculate size for each unused package
  let totalBytesSaved = 0;
  const sizedUnused = analysis.unused.map((item) => {
    const bytes = getPackageInstallSize(analysis.projectDir, item.name);
    totalBytesSaved += bytes;
    return {
      ...item,
      bytes,
      formattedSize: formatBytes(bytes),
    };
  });

  // Sort unused packages by weight, biggest first!
  sizedUnused.sort((a, b) => b.bytes - a.bytes);

  return {
    score: rawScore,
    letterGrade,
    comment,
    totalBytesSaved,
    formattedSpaceSaved: formatBytes(totalBytesSaved),
    sizedUnused,
  };
}

module.exports = {
  calculateScoreAndSavings,
  getDirectorySize,
  formatBytes,
  getPackageInstallSize,
};
