/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#b685ff',
          hover: '#c9a5ff',
        },
        surface: '#0f0e0b',
      },
    },
  },
  plugins: [],
}
