---
name: ui-ux-design
description: Audit, design, and implement responsive, visually stunning user interfaces using modern CSS, glassmorphism, glowing micro-animations, and premium color palettes.
allowed-tools: [write_file, edit_file, read_file, search_code, execute_command, detect_project]
---
# Premium UI/UX Design & Styling Specification (Stitch & Cloud Desktop Style)

Use this guide to build modern, professional, and visually breathtaking user interfaces that rival premium websites.

## 1. Visual Token & Design System

Always define CSS Custom Properties (variables) in the root stylesheet (e.g. `index.css`) to enforce consistency.

### Premium Dark Palette (Cyberpunk / Modern SaaS)
```css
:root {
  /* Backgrounds & Surfaces */
  --bg-primary: #080B10;      /* Deep midnight space */
  --bg-secondary: #0F131E;    /* Sleek container surface */
  --bg-tertiary: #171D2F;     /* Hover surface */
  
  /* Borders */
  --border-light: rgba(255, 255, 255, 0.06);
  --border-glow: rgba(139, 92, 246, 0.2);
  
  /* Accents (Saturated, Glowing) */
  --accent-primary: #8B5CF6;   /* Electric Violet */
  --accent-secondary: #06B6D4; /* Cyber Cyan */
  --accent-pink: #EC4899;      /* Hot Pink */
  
  /* Text colors */
  --text-main: #F3F4F6;        /* Slate 100 */
  --text-muted: #9CA3AF;       /* Slate 400 */
  --text-dark: #4B5563;        /* Slate 600 */
}
```

### Premium Light Palette (Clean & Professional)
```css
:root {
  --bg-primary: #F8FAFC;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F1F5F9;
  --border-light: rgba(0, 0, 0, 0.06);
  --border-glow: rgba(139, 92, 246, 0.1);
  --accent-primary: #6366F1;   /* Indigo */
  --accent-secondary: #0EA5E9; /* Sky Blue */
  --accent-pink: #D946EF;
  --text-main: #0F172A;
  --text-muted: #64748B;
  --text-dark: #94A3B8;
}
```

## 2. Advanced CSS Styles & Layouts

### Glassmorphism Card
Always apply a subtle blur and translucent borders to floating cards:
```css
.glass-card {
  background: rgba(15, 19, 30, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.glass-card:hover {
  border-color: var(--border-glow);
  box-shadow: 0 8px 32px 0 rgba(139, 92, 246, 0.15);
  transform: translateY(-2px);
}
```

### Glowing ACCENT Buttons
```css
.btn-glow {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 4px 14px 0 rgba(139, 92, 246, 0.3);
}
.btn-glow:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px 0 rgba(139, 92, 246, 0.5);
}
.btn-glow::after {
  content: '';
  position: absolute;
  top: -50%;
  left: -60%;
  width: 30%;
  height: 200%;
  background: rgba(255, 255, 255, 0.13);
  transform: rotate(35deg);
  transition: all 0.6s ease;
}
.btn-glow:hover::after {
  left: 120%;
}
```

### Gradient Text
```css
.text-gradient {
  background: linear-gradient(135deg, var(--text-main), var(--accent-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

## 3. Best Practices Workflow

1. **Setup CSS Variables**: Define theme colors, margins, and border radius properties.
2. **Typography**: Import a modern font (e.g. Outfit or Inter from Google Fonts) inside `index.html` or CSS:
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
   body { font-family: 'Outfit', sans-serif; }
   ```
3. **Layout**: Avoid tables or floats. Use CSS Grid for grids and Flexbox for linear layouts.
4. **Responsive Boundaries**: Always add fluid media queries:
   ```css
   @media (max-width: 768px) {
     .grid-layout { grid-template-columns: 1fr; }
   }
   ```
5. **Micro-Animations**: Add transition properties to all hover states (`transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`).
