'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_MEMORY = `# Project Memory

This file is automatically maintained by Devy Agent to persist knowledge across sessions.

## 📋 Task Log
*(No tasks completed yet)*

## 🛠️ Project Architecture & Tech Stack
*(To be populated as codebase is explored)*

## 📖 Development Conventions & Decisions
*(To be populated as code style/conventions are established)*

## ⚠️ Environment Quirks & Gotchas
*(To be populated with Termux, port-binding, or platform quirks)*
`;

/**
 * Persistent, per-project memory file at <workspace>/.devy-agent/memory.md.
 * Loaded (as a preview) into the system prompt at the start of every session so the agent
 * doesn't have to rediscover the same project context every time.
 */
class MemoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._ensure();
  }

  _ensure() {
    try {
      if (!fs.existsSync(this.filePath)) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, DEFAULT_MEMORY, 'utf8');
      }
    } catch (_) { /* non-fatal */ }
  }

  read() {
    try {
      return fs.readFileSync(this.filePath, 'utf8');
    } catch (_) {
      return DEFAULT_MEMORY;
    }
  }

  append(note) {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    try {
      fs.appendFileSync(this.filePath, `\n- [${ts}] ${note}`, 'utf8');
    } catch (_) { /* non-fatal */ }
    return this.read();
  }

  overwrite(content) {
    try {
      fs.writeFileSync(this.filePath, content, 'utf8');
    } catch (_) { /* non-fatal */ }
    return this.read();
  }

  /** Re-point this store at a different project's memory.md (used by set_project). */
  switchTo(filePath) {
    this.filePath = filePath;
    this._ensure();
  }

  /** Short preview injected into the system prompt - full content available via memory_read */
  preview(maxChars = 1200) {
    const c = this.read();
    return c.length > maxChars ? c.slice(0, maxChars) + '\n...(truncated - use memory_read for the full file)' : c;
  }
}

function buildMemoryTools(memoryStore) {
  return {
    memory_read: {
      description: 'Read the full persistent project memory file (.devy-agent/memory.md) - use to recall past context, decisions, or conventions for this project',
      params: {},
      handler: async () => ({ content: memoryStore.read() })
    },
    memory_append: {
      description: 'Append a durable note to project memory - use for important facts, decisions, or conventions worth remembering in future sessions',
      params: { note: 'string (required)' },
      handler: async ({ note }) => ({ success: true, content: memoryStore.append(note) })
    },
    memory_write: {
      description: 'Overwrite the entire project memory file - use sparingly, only to reorganize/clean up memory, not for routine notes (prefer memory_append)',
      params: { content: 'string (required)' },
      handler: async ({ content }) => ({ success: true, content: memoryStore.overwrite(content) })
    }
  };
}

module.exports = { MemoryStore, buildMemoryTools };
