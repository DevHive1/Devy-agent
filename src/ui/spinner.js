'use strict';
const { colors } = require('./theme');
const { cursor, erase, isTTY } = require('./layout');

class Spinner {
  constructor(text = '', stream = process.stderr) {
    this.text = text;
    this.stream = stream;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.interval = 80;
    this.frameIdx = 0;
    this.timer = null;
    this.active = false;
  }

  start(text = this.text) {
    if (this.active) return;
    this.text = text;
    this.active = true;

    if (!isTTY) {
      this.stream.write(`${this.text}...\n`);
      return;
    }

    cursor.hide();
    this.render();
    this.timer = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % this.frames.length;
      this.render();
    }, this.interval);
  }

  update(text) {
    this.text = text;
    if (!this.active) return;
    if (!isTTY) {
      this.stream.write(`${this.text}...\n`);
      return;
    }
    this.render();
  }

  render() {
    const frame = colors.brand(this.frames[this.frameIdx]);
    const message = colors.textDim(this.text);
    
    // Erase current line, move to beginning, print spinner frame + text
    this.stream.write('\r');
    erase.lineEnd();
    this.stream.write(`  ${frame}  ${message}`);
  }

  stop(symbol = colors.success('✔'), label = this.text) {
    if (!this.active) return;
    this.active = false;

    if (!isTTY) return;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.stream.write('\r');
    erase.lineEnd();
    this.stream.write(`  ${symbol}  ${colors.textDim(label)}\n`);
    cursor.show();
  }

  fail(label = this.text) {
    this.stop(colors.error('✖'), label);
  }

  warn(label = this.text) {
    this.stop(colors.warning('⚠'), label);
  }
}

module.exports = Spinner;
