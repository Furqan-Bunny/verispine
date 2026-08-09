# VeriSpine Brand Colors & Logo Guide

Tokens are taken directly from the client's live site (`verispinejointcenters.com`)
so the marketplace and the clinic site read as one brand.

## Base tokens

| Token | Hex | Role |
|---|---|---|
| navy | `#0B2A45` | Core brand colour — headers, footer, dark sections |
| navy-mid | `#133859` | Button hover, gradient end |
| navy-light | `#1E4F7A` | Default button fill |
| teal | `#1A8C7A` | Secondary actions, links, active states |
| teal-light | `#22B89E` | Gradient start, highlights |
| gold | `#C9973A` | High-intent CTAs, badges |
| gold-light | `#E5B86A` | Soft gold accents |
| cream | `#F7F4EF` | Warm section background |
| cream-dark | `#EDE8DF` | Section divider / alt background |

## Tailwind scales

Each token sits inside a full 50–950 ramp so `hover:`, `ring-`, `border-` and
opacity modifiers all work normally. Defined in `frontend/tailwind.config.js`.

### primary — Navy
| Shade | Hex | Usage |
|---|---|---|
| 50 | `#F2F7FB` | Lightest background |
| 100 | `#E2EDF5` | Light background |
| 200 | `#C0D8EA` | Hover background |
| 300 | `#93BBD8` | Borders |
| 400 | `#5A93BC` | Light accent |
| 500 | `#2E6C9B` | Focus ring |
| **600** | **`#1E4F7A`** | **Default button** (`.btn-primary`) |
| **700** | **`#133859`** | **Button hover** |
| **800** | **`#0B2A45`** | **Brand navy — header/footer surfaces** |
| 900 | `#081F33` | Deep surface |
| 950 | `#040F1B` | Deepest surface |

### secondary — Teal
| Shade | Hex | Usage |
|---|---|---|
| 500 | `#22B89E` | Gradient start, highlight |
| **600** | **`#1A8C7A`** | **Secondary button, links** |
| 700 | `#15705F` | Hover |

### accent — Gold
| Shade | Hex | Usage |
|---|---|---|
| 400 | `#E5B86A` | Soft accent |
| **600** | **`#C9973A`** | **High-intent CTA** (`.btn-accent`), badges |
| 700 | `#A67A2E` | Hover |

## Signature gradient

```css
/* teal -> deep navy, matching the client site */
background: linear-gradient(135deg, #1A8C7A 0%, #0B2A45 100%);
```
Available as the `.bg-gradient-brand` utility. Text version: `.text-gradient`
(navy-800 → teal-600).

## Typography

| Role | Family | Notes |
|---|---|---|
| Display (h1–h3) | **Lora** | Serif with a strong italic — used for the emphasised words in headlines, matching the client's voice |
| Body / UI | **Inter** | Everything else |

Both loaded from Google Fonts in `frontend/index.html`.

## Logo

| File | Use |
|---|---|
| `frontend/public/logo.svg` | Full mark on a navy rounded square. Navbar, favicon, light backgrounds. |
| `frontend/public/logo-light.svg` | Transparent variant. Footer and navy hero sections. |

The mark is a stylised spinal column: four vertebral segments on a gentle
S-curve, descending cream → teal → gold.

## Component classes

Defined in `frontend/src/index.css`:

| Class | Result |
|---|---|
| `.btn-primary` | Navy button |
| `.btn-secondary` | Teal button |
| `.btn-accent` | Gold button — reserve for Place Bid / Buy Now |
| `.btn-outline` | Navy outline |
| `.text-gradient` | Navy → teal text |
| `.bg-gradient-brand` | Teal → navy surface |
| `.bg-surface` | Cream section background |
