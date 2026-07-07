'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function renderHelpPanel(commands) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = colors.brand('╭─ ' + ICONS.plan + '  ' + colors.bold('Commands Help') + ' ' + '─'.repeat(Math.max(4, contentWidth - 18)) + '╮');
  const borderBottom = colors.brand('╰' + '─'.repeat(contentWidth) + '╯');
  const pipe = colors.brand(ICONS.pipe);

  const lines = [header];
  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);

  // Categorize or list commands
  commands.forEach(c => {
    const cmdStr = colors.bold.cyan(c.cmd.padEnd(16));
    const descStr = colors.textDim(c.desc);
    const content = `    ${cmdStr} ${descStr}`;
    const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(content).length - 2));
    lines.push(`  ${pipe}${content}${pad}  ${pipe}`);
  });

  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);
  lines.push(borderBottom);
  return lines.join('\n');
}

function renderModelsPanel(models, activeModel) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = colors.brand('╭─ ' + ICONS.terminal + '  ' + colors.bold('Available Models') + ' ' + '─'.repeat(Math.max(4, contentWidth - 21)) + '╮');
  const borderBottom = colors.brand('╰' + '─'.repeat(contentWidth) + '╯');
  const pipe = colors.brand(ICONS.pipe);

  const lines = [header];
  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);

  models.forEach(m => {
    const isActive = m === activeModel;
    const bullet = isActive ? colors.success(' ● ') : colors.textMuted(' ○ ');
    const name = isActive ? colors.bold.success(m) + colors.italic.textMuted(' (active)') : colors.text(m);
    const content = `    ${bullet} ${name}`;
    const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(content).length - 2));
    lines.push(`  ${pipe}${content}${pad}  ${pipe}`);
  });

  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);
  lines.push(borderBottom);
  return lines.join('\n');
}

function renderSkillsPanel(skills) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = colors.brand('╭─ ' + ICONS.skill + '  ' + colors.bold('Available Skills') + ' ' + '─'.repeat(Math.max(4, contentWidth - 21)) + '╮');
  const borderBottom = colors.brand('╰' + '─'.repeat(contentWidth) + '╯');
  const pipe = colors.brand(ICONS.pipe);

  const lines = [header];
  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);

  if (skills.length === 0) {
    const emptyMsg = colors.textDim('    No skills registered. Add skills to ~/.devy-agent/skills/');
    const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(emptyMsg).length - 2));
    lines.push(`  ${pipe}${emptyMsg}${pad}  ${pipe}`);
  } else {
    skills.forEach(s => {
      const skillName = colors.bold.cyan(s.name.padEnd(20));
      const skillDesc = colors.textDim(s.description);
      const content = `    ${skillName} ${skillDesc}`;
      const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(content).length - 2));
      lines.push(`  ${pipe}${content}${pad}  ${pipe}`);
    });
  }

  lines.push(`  ${pipe}${' '.repeat(contentWidth)}${pipe}`);
  lines.push(borderBottom);
  return lines.join('\n');
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  renderHelpPanel,
  renderModelsPanel,
  renderSkillsPanel
};
