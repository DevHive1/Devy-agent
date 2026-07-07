'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth } = require('./layout');

function renderPanel(titleText, contentText, borderColors, iconSymbol) {
  const width = Math.min(getWidth(), 80);
  const contentWidth = width - 6;

  const header = borderColors('╭─ ' + iconSymbol + '  ' + colors.bold(titleText) + ' ' + '─'.repeat(Math.max(4, contentWidth - titleText.length - 8)) + '╮');
  const borderBottom = borderColors('╰' + '─'.repeat(contentWidth) + '╯');
  const pipe = borderColors(ICONS.pipe);

  const lines = [header];
  
  // Split contentText into wrapped lines
  const rawLines = contentText.split('\n');
  for (const line of rawLines) {
    let current = line;
    while (stripAnsi(current).length > contentWidth - 4) {
      // Find the slice point in terms of visible characters, preserving ANSI sequences
      const target = contentWidth - 4;
      let visible = 0;
      let sliceIdx = 0;
      const ansiRe = /[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
      let lastIdx = 0;
      let match;
      const ansiPositions = [];
      const tmp = current;
      while ((match = ansiRe.exec(tmp)) !== null) {
        ansiPositions.push({ start: match.index, end: match.index + match[0].length });
      }
      let ai = 0;
      for (let ci = 0; ci < current.length; ci++) {
        // Skip over ANSI sequences
        if (ai < ansiPositions.length && ci === ansiPositions[ai].start) {
          ci = ansiPositions[ai].end - 1; // -1 because loop will ci++
          ai++;
          continue;
        }
        visible++;
        if (visible >= target) {
          sliceIdx = ci + 1;
          break;
        }
      }
      if (sliceIdx === 0) sliceIdx = current.length;
      const chunk = current.slice(0, sliceIdx);
      current = current.slice(sliceIdx);
      const chunkPad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(chunk).length - 4));
      lines.push(`  ${pipe}  ${colors.text(chunk)}${chunkPad}  ${pipe}`);
    }
    if (current || line === '') {
      const pad = ' '.repeat(Math.max(0, contentWidth - stripAnsi(current).length - 4));
      lines.push(`  ${pipe}  ${colors.text(current)}${pad}  ${pipe}`);
    }
  }

  lines.push(borderBottom);
  return lines.join('\n');
}

function renderThought(thoughtText) {
  return renderPanel('Agent Thoughts', thoughtText, colors.brandGlow, ICONS.think);
}

function renderInfo(infoText) {
  return renderPanel('Info', infoText, colors.info, ICONS.info);
}

function renderWarning(warnText) {
  return renderPanel('Warning', warnText, colors.warning, ICONS.warning);
}

function renderError(errText) {
  return renderPanel('Error Encountered', errText, colors.error, ICONS.failed);
}

function renderFinal(finalText) {
  return renderPanel('Task Completed Successfully', finalText, colors.success, ICONS.success);
}

function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

module.exports = {
  renderThought,
  renderInfo,
  renderWarning,
  renderError,
  renderFinal
};
