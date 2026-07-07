'use strict';
const chalk = require('chalk');

const PALETTE = {
  brand:        '#A78BFA',    // Soft violet (primary)
  brandDim:     '#7C3AED',    // Deep violet  
  brandGlow:    '#C4B5FD',    // Light violet (highlights)
  
  success:      '#34D399',    // Emerald green
  error:        '#F87171',    // Soft red
  warning:      '#FBBF24',    // Warm amber
  info:         '#60A5FA',    // Sky blue
  
  text:         '#E2E8F0',    // Slate 200
  textDim:      '#94A3B8',    // Slate 400
  textMuted:    '#64748B',    // Slate 500
  border:       '#334155',    // Slate 700
  surface:      '#1E293B',    // Slate 800
  background:   '#0F172A',    // Slate 900
  
  cyan:         '#22D3EE',    
  pink:         '#F472B6',
  orange:         '#FB923C',
};

const colors = {
  brand: chalk.hex(PALETTE.brand),
  brandDim: chalk.hex(PALETTE.brandDim),
  brandGlow: chalk.hex(PALETTE.brandGlow),
  success: chalk.hex(PALETTE.success),
  error: chalk.hex(PALETTE.error),
  warning: chalk.hex(PALETTE.warning),
  info: chalk.hex(PALETTE.info),
  text: chalk.hex(PALETTE.text),
  textDim: chalk.hex(PALETTE.textDim),
  textMuted: chalk.hex(PALETTE.textMuted),
  border: chalk.hex(PALETTE.border),
  surface: chalk.hex(PALETTE.surface),
  cyan: chalk.hex(PALETTE.cyan),
  pink: chalk.hex(PALETTE.pink),
  orange: chalk.hex(PALETTE.orange),
  
  bold: Object.assign((str) => chalk.bold(str), {
    brand: chalk.hex(PALETTE.brand).bold,
    brandDim: chalk.hex(PALETTE.brandDim).bold,
    brandGlow: chalk.hex(PALETTE.brandGlow).bold,
    success: chalk.hex(PALETTE.success).bold,
    error: chalk.hex(PALETTE.error).bold,
    warning: chalk.hex(PALETTE.warning).bold,
    info: chalk.hex(PALETTE.info).bold,
    text: chalk.hex(PALETTE.text).bold,
    textDim: chalk.hex(PALETTE.textDim).bold,
    cyan: chalk.hex(PALETTE.cyan).bold,
    pink: chalk.hex(PALETTE.pink).bold,
    orange: chalk.hex(PALETTE.orange).bold
  }),
  
  italic: Object.assign((str) => chalk.italic(str), {
    textDim: chalk.hex(PALETTE.textDim).italic,
    textMuted: chalk.hex(PALETTE.textMuted).italic
  }),
  
  dim: chalk.dim
};

const ICONS = {
  // Status
  success:   '✔',    
  pending:   '○',    
  running:   '◉',
  failed:    '✖',    
  warning:   '⚠️',    
  info:      'ℹ️',
  
  // Actions  
  read:      '📖',    
  write:     '📝',    
  edit:      '✏️',
  delete:    '🗑️',    
  execute:   '💻',    
  search:    '🔍',
  
  // Objects
  file:      '📄',    
  folder:    '📁',    
  git:       '🔀',
  github:    '🐙',    
  plan:      '📋',    
  memory:    '🧠',    
  skill:     '🎯',    
  think:     '💭',    
  subagent:  '⊡',
  
  // Decorative
  arrow:     '→',    
  dot:       '•',    
  dash:      '─',
  corner:    '╰',    
  pipe:      '│',    
  branch:    '├',
  terminal:  '❯',    
  sparkle:   '✦',
};

module.exports = {
  PALETTE,
  colors,
  ICONS
};
