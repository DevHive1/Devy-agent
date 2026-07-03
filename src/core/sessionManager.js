'use strict';
const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor({ sessionsDir }) {
    this.sessionsDir = sessionsDir;
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  createSession(metadata = {}) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session = { id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata, messages: [], runningSummary: '', plan: null };
    this._save(id, session);
    return session;
  }

  saveSession(id, data) {
    const existing = this.loadSession(id) || {};
    const session = { ...existing, ...data, id, updatedAt: new Date().toISOString() };
    this._save(id, session);
  }

  loadSession(id) {
    const file = path.join(this.sessionsDir, `${id}.json`);
    try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; } catch (_) { return null; }
  }

  listSessions() {
    try {
      return fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.json')).map(f => {
        try { const d = JSON.parse(fs.readFileSync(path.join(this.sessionsDir, f), 'utf8')); return { id: d.id, createdAt: d.createdAt, updatedAt: d.updatedAt, metadata: d.metadata }; } catch (_) { return null; }
      }).filter(Boolean).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    } catch (_) { return []; }
  }

  deleteSession(id) {
    const file = path.join(this.sessionsDir, `${id}.json`);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  }

  exportSession(id) {
    const session = this.loadSession(id);
    if (!session) return null;
    let md = `# Session ${id}\n**Created:** ${session.createdAt}\n**Updated:** ${session.updatedAt}\n\n`;
    if (session.runningSummary) md += `## Summary\n${session.runningSummary}\n\n`;
    if (session.messages) { md += '## Transcript\n'; session.messages.forEach(m => { md += `**${m.role}:** ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}\n\n`; }); }
    return md;
  }

  _save(id, data) { fs.writeFileSync(path.join(this.sessionsDir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8'); }
}

module.exports = { SessionManager };
