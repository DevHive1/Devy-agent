'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function printOverhauledBanner(config) {
  const width = Math.min(getWidth(), 80);
  const border = colors.brandDim('╺' + '━'.repeat(width - 4) + '╸');
  
  console.log('\n');
  console.log(border);
  console.log('');
  
  // Custom ASCII branding layout
  const brand = `         ${colors.bold.brand('◆  D E V Y   A G E N T  v1.0')}         `;
  console.log(brand);
  console.log(`        ${colors.textMuted('Autonomous Git & Codebase Assistant')}`);
  console.log('');
  console.log(border);
  console.log('');

  // Info details table
  const colWidth = 14;
  const printRow = (label, val, indicator = '') => {
    const formattedLabel = colors.textDim(label.padEnd(colWidth));
    const formattedVal = colors.text(val);
    console.log(`    ${formattedLabel}  ${formattedVal}  ${indicator}`);
  };

  printRow('Model', config.ollama.model, colors.success(ICONS.success));
  printRow('Ollama Host', config.ollama.host, colors.success(ICONS.success));
  
  const ghStatus = config.github.token 
    ? colors.success('connected') + ' ' + colors.success(ICONS.success)
    : colors.warning('token missing (GitHub disabled)') + ' ' + colors.warning(ICONS.warning);
  printRow('GitHub', ghStatus);
  
  printRow('Workspace', config.workspaceDir);
  
  console.log('');
  console.log(`  ${colors.textMuted('Type a request, or')} ${colors.bold.brand('/help')} ${colors.textMuted('to view available slash commands.')}`);
  console.log('');
}

module.exports = {
  printOverhauledBanner
};
