import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // BLOC Brand Colors
        bloc: {
          navy: '#1e3a5f',
          blue: '#2563eb',
          lightBlue: '#3b82f6',
          gold: '#d4a574',
          lightGold: '#f5e6d3',
        },
        // Chapter Colors
        chapter: {
          north: '#10b981',    // Emerald
          south: '#f59e0b',    // Amber
          uptown: '#8b5cf6',   // Purple
          floc: '#3b82f6',     // Blue
          alumni: '#6b7280',   // Gray
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [],
}

export default config
