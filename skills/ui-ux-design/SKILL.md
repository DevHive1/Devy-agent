---
name: ui-ux-design
description: Design and implement responsive, accessible, and visually polished user interfaces with modern CSS, animations, and best practices.
allowed-tools: [write_file, edit_file, read_file, search_code, execute_command, detect_project]
---
# UI/UX Design Workflow

## Steps

1. **Audit current UI**: Use `read_file` to inspect existing HTML/CSS/JS templates, stylesheets, and component files.
2. **Identify framework**: Run `detect_project` to check if React, Vue, Svelte, or vanilla HTML is in use.
3. **Design system check**: Look for existing design tokens (colors, spacing, typography) in CSS variables or theme files.
4. **Implement improvements**:
   - Add CSS custom properties for consistent theming (`--color-primary`, `--spacing-md`, etc.)
   - Use modern layout: CSS Grid + Flexbox
   - Add responsive breakpoints (`@media` queries for mobile/tablet/desktop)
   - Add smooth transitions and micro-animations (`transition`, `@keyframes`)
   - Ensure accessibility: proper ARIA labels, focus states, color contrast ratios ≥ 4.5:1
   - Use semantic HTML5 elements (`<nav>`, `<main>`, `<article>`, `<aside>`)
5. **Dark mode**: Add `prefers-color-scheme: dark` media query support or a toggle class.
6. **Typography**: Use system font stack or import a clean Google Font (Inter, Outfit, etc.).
7. **Verify**: Preview the changes by running the dev server via `execute_command`.
