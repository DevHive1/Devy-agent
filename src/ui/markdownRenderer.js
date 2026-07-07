'use strict';
const { marked } = require('marked');
const TerminalRenderer = require('marked-terminal').default || require('marked-terminal');
const highlight = require('cli-highlight').highlight;
const { colors } = require('./theme');

// Set up the terminal markdown renderer custom styling
const rendererOptions = {
  // Headings
  firstHeading: colors.bold.brand,
  heading: colors.bold.brand,
  
  // Text styles
  strong: colors.bold.text,
  em: colors.italic.textDim,
  codespan: (code) => colors.cyan(code),
  
  // Lists
  listitem: (text) => `  ${colors.brandDim('•')} ${text}`,
  
  // Block quotes
  blockquote: (quote) => colors.italic.textDim(quote.split('\n').map(line => `  │ ${line}`).join('\n')),
  
  // Horizontal rule
  hr: () => colors.border('─'.repeat(40)) + '\n',
  
  // Code block highlighter
  code: (code, lang) => {
    try {
      const language = lang || 'javascript';
      const highlighted = highlight(code, { language, ignoreIllegals: true });
      return '\n' + highlighted.split('\n').map(line => `  ${line}`).join('\n') + '\n';
    } catch (e) {
      return '\n' + code.split('\n').map(line => `  ${line}`).join('\n') + '\n';
    }
  }
};

marked.setOptions({
  renderer: new TerminalRenderer(rendererOptions)
});

function renderMarkdown(md) {
  if (!md) return '';
  return marked(md).trim();
}

module.exports = {
  renderMarkdown
};
