/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        foreground: '#ededed',
        card: '#0a0a0a',
        'card-hover': '#121212',
        border: '#222222',
        'border-light': '#333333',
        crimson: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        vercel: {
          blue: '#0070f3',
          cyan: '#50e3c2',
          purple: '#7928ca',
          pink: '#ff0080',
          yellow: '#f5a623',
          red: '#ff0000',
          gray: '#888888',
          dark: '#0a0a0a',
        },
        primary: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#ffffff',
          600: '#e5e5e5',
          700: '#737373',
          800: '#404040',
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      backgroundImage: {
        'vercel-gradient': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 119, 198, 0.15), transparent)',
        'grid-pattern': "linear-gradient(to right, #1f1f1f 1px, transparent 1px), linear-gradient(to bottom, #1f1f1f 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
}
