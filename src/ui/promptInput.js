'use strict';
const { colors, ICONS } = require('./theme');

function getPromptString(projectContext = null, approvalManager = null) {
  let projectSuffix = '';
  if (projectContext && projectContext.projectName) {
    projectSuffix = ` [${colors.brandGlow(projectContext.projectName)}]`;
  }

  let modeSuffix = '';
  if (approvalManager) {
    const mode = approvalManager.getMode();
    const modeColor = mode === 'full-auto' ? colors.success : mode === 'auto-edit' ? colors.cyan : colors.warning;
    modeSuffix = ` (${modeColor(mode)})`;
  }

  const promptSymbol = colors.bold.brand(ICONS.terminal);
  
  return `devy${projectSuffix}${modeSuffix} ${promptSymbol} `;
}

module.exports = {
  getPromptString
};
