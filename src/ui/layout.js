'use strict';

const isTTY = process.stdout.isTTY;

function getWidth() {
  return isTTY ? (process.stdout.columns || 80) : 80;
}

function getHeight() {
  return isTTY ? (process.stdout.rows || 24) : 24;
}

// Simple fallback text wrapper if wrap-ansi is not yet available/required
function wrapTextSimple(text, width) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length > width) {
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  return lines.join('\n');
}

function wrapText(text, width) {
  try {
    const wrapAnsi = require('wrap-ansi');
    return wrapAnsi(text, width, { hard: true });
  } catch (e) {
    return wrapTextSimple(text, width);
  }
}

function getStringWidth(str) {
  try {
    const stringWidth = require('string-width');
    return stringWidth(str);
  } catch (e) {
    // Strip ANSI codes and return length
    const clean = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    return clean.length;
  }
}

// ANSI Escape Helpers
const ESC = '\u001b[';
const cursor = {
  to: (x, y) => isTTY ? process.stdout.write(`${ESC}${y};${x}H`) : null,
  move: (x, y) => {
    if (!isTTY) return;
    if (x > 0) process.stdout.write(`${ESC}${x}C`);
    else if (x < 0) process.stdout.write(`${ESC}${-x}D`);
    if (y > 0) process.stdout.write(`${ESC}${y}B`);
    else if (y < 0) process.stdout.write(`${ESC}${-y}A`);
  },
  up: (n) => isTTY ? process.stdout.write(`${ESC}${n}A`) : null,
  down: (n) => isTTY ? process.stdout.write(`${ESC}${n}B`) : null,
  left: () => isTTY ? process.stdout.write('\r') : null,
  hide: () => isTTY ? process.stdout.write(`${ESC}?25l`) : null,
  show: () => isTTY ? process.stdout.write(`${ESC}?25h`) : null,
  save: () => isTTY ? process.stdout.write(`${ESC}s`) : null,
  restore: () => isTTY ? process.stdout.write(`${ESC}u`) : null,
};

const erase = {
  screen: () => isTTY ? process.stdout.write(`${ESC}2J`) : null,
  line: () => isTTY ? process.stdout.write(`${ESC}2K`) : null,
  lineEnd: () => isTTY ? process.stdout.write(`${ESC}K`) : null,
};

module.exports = {
  isTTY,
  getWidth,
  getHeight,
  wrapText,
  getStringWidth,
  cursor,
  erase
};
