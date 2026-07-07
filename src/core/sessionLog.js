'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Persistent, per-project chat/session log at <project>/.devy-agent/chat.md.
 * A clean, human-readable record of what was asked and what the agent delivered -
 * separate from the verbose step-by-step terminal output.
 */
class SessionLog {
  constructor(filePath) {
    this.filePath = filePath;
    this._ensure();
  }

  _ensure() {
    try {
      if (!fs.existsSync(this.filePath)) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, '# Session Log\n', 'utf8');
      }
    } catch (_) { /* non-fatal */ }
  }

  append(role, text) {
    if (!text) return;
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    try {
      fs.appendFileSync(this.filePath, `\n## ${role} — ${ts}\n\n${text}\n`, 'utf8');
    } catch (_) { /* non-fatal */ }
  }

  appendTurn({ userInput, toolsExecuted, response }) {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    
    let toolsSection = '';
    if (toolsExecuted && toolsExecuted.length > 0) {
      toolsSection = `\n\n#### 🛠️ Tools Executed:\n` + toolsExecuted.map(t => {
        const cleanParams = t.params ? JSON.stringify(t.params) : '{}';
        const displayParams = cleanParams.length > 300 ? cleanParams.slice(0, 300) + '...' : cleanParams;
        return `- \`${t.tool}\` (${displayParams})`;
      }).join('\n');
    }

    const entry = `
---

## 💬 Turn — ${ts}

### 👤 User Prompt
> ${userInput.trim().replace(/\n/g, '\n> ')}
${toolsSection}

### 🤖 Devy Agent Response
${response.trim()}
`;
    try {
      fs.appendFileSync(this.filePath, entry, 'utf8');
    } catch (_) { /* non-fatal */ }
  }

  /** Re-point this log at a new project's chat file (used when set_project switches directories). */
  switchTo(filePath) {
    this.filePath = filePath;
    this._ensure();
  }
}

module.exports = { SessionLog };
