/** @type {import('tailwindcss').Config} */

// VeriSpine brand palette.
// Base tokens taken from the client's live site (verispinejointcenters.com):
//   navy #0B2A45 / navy-mid #133859 / navy-light #1E4F7A
//   teal #1A8C7A / teal-light #22B89E
//   gold #C9973A / gold-light #E5B86A
//   cream #F7F4EF / cream-dark #EDE8DF
// Each token is anchored inside a full 50-950 ramp so Tailwind utilities
// (hover:, ring-, border-, /opacity) all behave normally.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary — navy. Buttons, headers, dark surfaces.
        primary: {
          50: '#F2F7FB',
          100: '#E2EDF5',
          200: '#C0D8EA',
          300: '#93BBD8',
          400: '#5A93BC',
          500: '#2E6C9B',
          600: '#1E4F7A', // navy-light  — default button
          700: '#133859', // navy-mid    — hover
          800: '#0B2A45', // navy        — brand surface (header/footer)
          900: '#081F33',
          950: '#040F1B',
        },
        // Secondary — teal. Links, active states, success/accent CTAs.
        secondary: {
          50: '#F0FBF8',
          100: '#D9F5EE',
          200: '#B0EADD',
          300: '#7ADAC7',
          400: '#3FC4AB',
          500: '#22B89E', // teal-light
          600: '#1A8C7A', // teal — brand
          700: '#15705F',
          800: '#12594D',
          900: '#0F4840',
          950: '#062925',
        },
        // Accent — gold. Highlights, badges, premium emphasis.
        accent: {
          50: '#FDF9F1',
          100: '#FAF0DC',
          200: '#F4DFB6',
          300: '#EBC886',
          400: '#E5B86A', // gold-light
          500: '#D4A44E',
          600: '#C9973A', // gold — brand
          700: '#A67A2E',
          800: '#855F28',
          900: '#6D4E24',
          950: '#3E2B12',
        },
        // Cream — warm neutral page/section surfaces.
        cream: {
          DEFAULT: '#F7F4EF',
          dark: '#EDE8DF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Lora', 'Georgia', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
