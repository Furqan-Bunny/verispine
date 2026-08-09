# 🎨 Quicksell Brand Colors & Logo Guide

## Logo Color Scheme

### Primary Logo Colors

#### Main Brand Color (Orange)
```
Hex: #ea580c
RGB: rgb(234, 88, 12)
HSL: hsl(20, 92%, 48%)
Name: Primary-600
Usage: Main logo icon, primary buttons, active states
```

#### Secondary Brand Color (Blue)
```
Hex: #0284c7
RGB: rgb(2, 132, 199)
HSL: hsl(200, 98%, 39%)
Name: Secondary-600
Usage: Gradient end color, secondary elements
```

#### Logo Gradient
```css
background: linear-gradient(90deg, #ea580c 0%, #0284c7 100%);
/* Orange to Blue gradient for text */
```

---

## Complete Color Palette

### Primary Colors (Orange)
| Shade | Hex Code | RGB | Usage |
|-------|----------|-----|-------|
| 50 | #fff7ed | rgb(255, 247, 237) | Lightest background |
| 100 | #ffedd5 | rgb(255, 237, 213) | Light backgrounds |
| 200 | #fed7aa | rgb(254, 215, 170) | Hover backgrounds |
| 300 | #fdba74 | rgb(253, 186, 116) | Borders |
| 400 | #fb923c | rgb(251, 146, 60) | Light accents |
| **500** | **#f97316** | **rgb(249, 115, 22)** | **Main orange** |
| **600** | **#ea580c** | **rgb(234, 88, 12)** | **Logo & buttons** |
| 700 | #c2410c | rgb(194, 65, 12) | Hover states |
| 800 | #9a3412 | rgb(154, 52, 18) | Dark accents |
| 900 | #7c2d12 | rgb(124, 45, 18) | Darkest shade |

### Secondary Colors (Blue)
| Shade | Hex Code | RGB | Usage |
|-------|----------|-----|-------|
| 50 | #f0f9ff | rgb(240, 249, 255) | Lightest background |
| 100 | #e0f2fe | rgb(224, 242, 254) | Light backgrounds |
| 200 | #bae6fd | rgb(186, 230, 253) | Hover backgrounds |
| 300 | #7dd3fc | rgb(125, 211, 252) | Borders |
| 400 | #38bdf8 | rgb(56, 189, 248) | Light accents |
| **500** | **#0ea5e9** | **rgb(14, 165, 233)** | **Main blue** |
| **600** | **#0284c7** | **rgb(2, 132, 199)** | **Gradient & buttons** |
| 700 | #0369a1 | rgb(3, 105, 161) | Hover states |
| 800 | #075985 | rgb(7, 89, 133) | Dark accents |
| 900 | #0c4a6e | rgb(12, 74, 110) | Darkest shade |

---

## Logo Implementation

### Light Background Logo
```css
/* Icon */
.logo-icon {
  color: #ea580c; /* primary-600 */
  height: 32px;
  width: 32px;
}

/* Text with gradient */
.logo-text {
  font-size: 24px;
  font-weight: bold;
  background: linear-gradient(90deg, #ea580c 0%, #0284c7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Dark Background Logo
```css
/* Icon for dark backgrounds */
.logo-icon-dark {
  color: #fb923c; /* primary-400 - lighter orange */
  height: 32px;
  width: 32px;
}

/* Text for dark backgrounds */
.logo-text-dark {
  color: #ffffff;
  font-size: 24px;
  font-weight: bold;
}
```

---

## Supporting Colors

### Neutral Colors (Gray)
```
gray-50:  #f9fafb - Backgrounds
gray-100: #f3f4f6 - Light backgrounds
gray-300: #d1d5db - Borders
gray-600: #4b5563 - Body text
gray-700: #374151 - Headings
gray-900: #111827 - Dark text
```

### Status Colors
```
Success: #22c55e (green-500)
Error:   #ef4444 (red-500)
Warning: #f59e0b (amber-500)
Info:    #3b82f6 (blue-500)
```

---

## Usage Guidelines

### Logo Variations

#### 1. Primary Logo (Horizontal)
- Icon: Shopping bag icon in #ea580c
- Text: "Quicksell" with gradient effect
- Usage: Main navigation, marketing materials

#### 2. Monochrome Logo
- All white (#ffffff) for dark backgrounds
- All dark (#111827) for light backgrounds
- Usage: Footer, overlays

#### 3. Icon Only
- Square format with shopping bag icon
- Color: #ea580c on light, #fb923c on dark
- Usage: Favicon, app icon, social media

### Color Combinations

#### Recommended Pairings
✅ Primary orange (#ea580c) with white (#ffffff)
✅ Primary orange (#ea580c) with gray-50 (#f9fafb)
✅ Secondary blue (#0284c7) with white (#ffffff)
✅ Orange-to-blue gradient on light backgrounds

#### Avoid These Combinations
❌ Primary orange on secondary blue background
❌ Light orange shades on white (low contrast)
❌ Multiple gradient effects in close proximity

---

## Quick Copy CSS Variables

```css
:root {
  /* Primary Brand Colors */
  --brand-primary: #ea580c;
  --brand-secondary: #0284c7;
  --brand-gradient: linear-gradient(90deg, #ea580c 0%, #0284c7 100%);

  /* Primary Palette */
  --primary-50: #fff7ed;
  --primary-100: #ffedd5;
  --primary-200: #fed7aa;
  --primary-300: #fdba74;
  --primary-400: #fb923c;
  --primary-500: #f97316;
  --primary-600: #ea580c;
  --primary-700: #c2410c;
  --primary-800: #9a3412;
  --primary-900: #7c2d12;

  /* Secondary Palette */
  --secondary-50: #f0f9ff;
  --secondary-100: #e0f2fe;
  --secondary-200: #bae6fd;
  --secondary-300: #7dd3fc;
  --secondary-400: #38bdf8;
  --secondary-500: #0ea5e9;
  --secondary-600: #0284c7;
  --secondary-700: #0369a1;
  --secondary-800: #075985;
  --secondary-900: #0c4a6e;

  /* Neutral Colors */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-300: #d1d5db;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-900: #111827;

  /* Status Colors */
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --info: #3b82f6;
}
```

---

## Tailwind Config

```javascript
// tailwind.config.js colors
colors: {
  primary: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
    950: '#431407',
  },
  secondary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  }
}
```

---

## Design Assets

### Hex Codes for Design Software
```
Primary Orange:    #ea580c
Secondary Blue:    #0284c7
Light Orange:      #fb923c
Dark Orange:       #c2410c
Light Blue:        #0ea5e9
Dark Blue:         #0369a1
White:             #ffffff
Black:             #111827
Gray Background:   #f9fafb
```

### Adobe/Figma Color Tokens
```json
{
  "brand": {
    "primary": "#ea580c",
    "secondary": "#0284c7",
    "gradient-start": "#ea580c",
    "gradient-end": "#0284c7",
    "light": "#fb923c",
    "dark": "#c2410c"
  }
}
```

---

## Brand Identity

### Color Psychology
- **Orange (#ea580c)**: Energy, enthusiasm, confidence, action
- **Blue (#0284c7)**: Trust, reliability, professionalism, security
- **Gradient**: Innovation, dynamism, modern technology

### Brand Personality
The orange-to-blue gradient represents the journey from excitement (bidding) to trust (secure transactions), perfectly capturing Quicksell's auction platform essence.

---

*Last Updated: December 2024*
*Version: 1.0*