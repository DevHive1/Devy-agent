'use strict';
const path = require('path');

/**
 * Holds the currently active project directory. File/terminal/git tools read
 * `projectContext.dir` at call time (not at tool-build time), so when the agent calls
 * set_project to switch into a subdirectory, every tool immediately starts operating
 * there without needing to rebuild the tool registry.
 */
class ProjectContext {
  constructor(rootDir) {
    this.baseDir = rootDir; // the anchor workspace - where subprojects get created
    this.dir = rootDir;     // the currently active directory tools operate on
    this.projectName = null;
  }

  /** Switch the active directory to a named subdirectory of the base workspace. */
  switchToSubproject(dir, name) {
    this.dir = dir;
    this.projectName = name;
  }

  /** Reset back to the base workspace (no active subproject). */
  resetToBase() {
    this.dir = this.baseDir;
    this.projectName = null;
  }
}

/** Resolves a path relative to the given root, rejecting anything that escapes it. */
function resolveWithin(rootDir, p) {
  const resolved = path.resolve(rootDir, p || '.');
  if (!resolved.startsWith(path.resolve(rootDir))) {
    throw new Error('Not allowed: path is outside the active project directory');
  }
  return resolved;
}

module.exports = { ProjectContext, resolveWithin };
