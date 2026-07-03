'use strict';
const path = require('path');

const DEFAULT_DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf\s+(?:\/|~|\$HOME|\*)/i, description: 'Attempts to delete system, home, or root directory' },
  { pattern: /:([^:]*)\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, description: 'Fork bomb detected' },
  { pattern: />\s*\/dev\/sd[a-z]|dd\s+if=/i, description: 'Direct raw disk read/write detected' },
  { pattern: /chmod\s+(?:777|a\+rwx)/i, description: 'Setting overly permissive (777) file permissions' },
  { pattern: /(?:curl|wget)[^|]*\|\s*(?:bash|sh)/i, description: 'Piping untrusted remote script directly to shell' },
  { pattern: /(?:DROP\s+TABLE|DELETE\s+FROM|TRUNCATE\s+TABLE)\b/i, description: 'Potentially destructive SQL database operation' },
  { pattern: /git\s+push\s+(?:[^-\s]+\s+)*(?:--force|-f)\b(?!.*--force-with-lease)/, description: 'Git force push without lease protection' }
];

class Sandbox {
  constructor({ projectDir, networkPolicy = 'allow', dangerousPatterns = [] } = {}) {
    this.projectDir = projectDir ? path.resolve(projectDir) : null;
    this.networkPolicy = networkPolicy; // 'allow' | 'block'
    this.dangerousPatterns = [...DEFAULT_DANGEROUS_PATTERNS, ...dangerousPatterns];
  }

  /**
   * Validates if a shell command is safe to execute.
   * @param {string} command - Shell command.
   * @returns {object} { allowed: boolean, reason?: string }
   */
  validateCommand(command) {
    if (!command) return { allowed: true };

    // 1. Check against dangerous patterns
    for (const rule of this.dangerousPatterns) {
      if (rule.pattern.test(command)) {
        return {
          allowed: false,
          reason: `Security threat: ${rule.description} (${rule.pattern.toString()})`
        };
      }
    }

    // 2. Check network policy if blocking
    if (this.networkPolicy === 'block') {
      // Basic detection of curl, wget, npm install, pip install, git clone, git push, git pull
      const networkCmds = /\b(?:curl|wget|npm\s+install|yarn\s+add|pnpm\s+add|pip\s+install|git\s+clone|git\s+pull|git\s+push|apt-get|pkg\s+install)\b/i;
      if (networkCmds.test(command)) {
        return {
          allowed: false,
          reason: 'Security threat: Network access is blocked in this sandbox session.'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Helper to verify if a path falls within the sandbox project root.
   * @param {string} filePath - Path to check.
   * @returns {boolean} True if within project directory.
   */
  isPathWithinProject(filePath) {
    if (!this.projectDir || !filePath) return true;
    try {
      const resolved = path.resolve(this.projectDir, filePath);
      return resolved.startsWith(this.projectDir);
    } catch (_) {
      return false;
    }
  }
}

module.exports = Sandbox;
