/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#8b5cf6',
          hover: '#7c3aed',
          soft: '#b685ff',
          'soft-hover': '#c9a5ff',
        },
        surface: '#0f0e0b',
      },
    },
  },
  plugins: [],
}
