'use strict';
const { colors, ICONS } = require('./theme');
const { getWidth, cursor, erase } = require('./layout');
const { renderMarkdown } = require('./markdownRenderer');

class StreamRenderer {
  constructor() {
    this.buffer = '';
    this.linesPrinted = 0;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.buffer = '';
    this.linesPrinted = 0;

    const width = Math.min(getWidth(), 80);
    const title = ` ${ICONS.sparkle}  ${colors.bold('Agent Response')} `;
    const headerLine = colors.brand('╭─' + title + '─'.repeat(Math.max(4, width - title.length - 4)) + '╮');
    
    process.stdout.write('\n' + headerLine + '\n');
    this.linesPrinted = 1;
  }

  writeToken(token) {
    if (!this.active) return;
    this.buffer += token;
    this.render();
  }

  render() {
    const width = Math.min(getWidth(), 80);
    const contentWidth = width - 6; // Accounts for left padding/border: '  │  ' and right margin

    // Simple word wrapping for the streaming display
    const rawLines = this.buffer.split('\n');
    const displayLines = [];

    for (const rawLine of rawLines) {
      if (rawLine === '') {
        displayLines.push('');
        continue;
      }
      let current = '';
      const words = rawLine.split(' ');
      for (const word of words) {
        if ((current + word).length > contentWidth) {
          displayLines.push(current.trim());
          current = word + ' ';
        } else {
          current += word + ' ';
        }
      }
      if (current) displayLines.push(current.trim());
    }

    // Move cursor back up to rewrite
    if (this.linesPrinted > 1) {
      cursor.up(this.linesPrinted - 1);
    }
    
    // Write out the wrapped lines with borders
    this.linesPrinted = 0;
    for (const line of displayLines) {
      const border = colors.brand(ICONS.pipe);
      const text = colors.text(line.padEnd(contentWidth));
      process.stdout.write(`  ${border}  ${text}\r\n`);
      this.linesPrinted++;
    }
    
    // Add one extra print line counter for the cursor position at the end
    this.linesPrinted++;
  }

  finish() {
    if (!this.active) return;
    this.active = false;

    const width = Math.min(getWidth(), 80);
    const contentWidth = width - 6;

    // Erase the raw streaming lines and rewrite with Markdown!
    if (this.linesPrinted > 0) {
      cursor.up(this.linesPrinted - 1);
      for (let i = 0; i < this.linesPrinted - 1; i++) {
        erase.line();
        cursor.down(1);
      }
      cursor.up(this.linesPrinted - 1);
    }

    // Render fully formatted Markdown
    const markdownContent = renderMarkdown(this.buffer);
    const mdLines = markdownContent.split('\n');
    
    for (const line of mdLines) {
      const border = colors.brand(ICONS.pipe);
      const cleanLine = line.trimEnd();
      process.stdout.write(`  ${border}  ${cleanLine}\n`);
    }

    const footerLine = colors.brand('╰' + '─'.repeat(width - 2) + '╯');
    process.stdout.write(footerLine + '\n\n');
  }
}

module.exports = StreamRenderer;
