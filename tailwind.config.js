/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Baloo 2 covers Latin + Devanagari, Baloo Bhai 2 covers Gujarati.
        sans: ['"Baloo 2"', '"Baloo Bhai 2"', 'ui-rounded', 'system-ui', 'sans-serif'],
        gu: ['"Baloo Bhai 2"', '"Baloo 2"', 'system-ui', 'sans-serif'],
      },
      colors: {
        saffron: { 50: '#fff6ed', 100: '#ffe8d1', 200: '#ffcf9f', 300: '#ffad63', 400: '#ff8f33', 500: '#ff7a1a', 600: '#f05f05', 700: '#c74706', 800: '#9e380d', 900: '#7f300e' },
        sunny: { 50: '#fffbea', 100: '#fff3c4', 200: '#ffe685', 300: '#ffd546', 400: '#ffc41f', 500: '#f9a806', 600: '#dd8002', 700: '#b75a06' },
        bubble: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d' },
        sky2: { 50: '#eef9ff', 100: '#d9f1ff', 200: '#bce7ff', 300: '#8edaff', 400: '#59c3ff', 500: '#33a5ff', 600: '#1b86f5', 700: '#146fe1' },
        leaf: { 50: '#effef4', 100: '#d9fde6', 200: '#b5f9cf', 300: '#7bf2ab', 400: '#3ae27f', 500: '#12c85f', 600: '#08a64b', 700: '#0a823e' },
        grape: { 50: '#f6f3ff', 100: '#eee9fe', 200: '#dfd6fe', 300: '#c8b5fd', 400: '#ad8bfa', 500: '#925cf6', 600: '#833aed', 700: '#7228d9' },
        ink: { 400: '#7a7491', 500: '#5f5878', 600: '#4a4361', 700: '#38324d', 800: '#272238', 900: '#1b1728' },
      },
      boxShadow: {
        pop: '0 4px 0 0 rgba(39, 34, 56, 0.12)',
        soft: '0 10px 30px -12px rgba(114, 40, 217, 0.25)',
        glow: '0 10px 25px -8px rgba(255, 122, 26, 0.55)',
      },
      borderRadius: { '4xl': '2rem' },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        wiggle: { '0%,100%': { transform: 'rotate(-4deg)' }, '50%': { transform: 'rotate(4deg)' } },
        pop: { '0%': { transform: 'scale(0.8)', opacity: '0' }, '60%': { transform: 'scale(1.05)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        confetti: { '0%': { transform: 'translateY(0) rotate(0)', opacity: '1' }, '100%': { transform: 'translateY(220px) rotate(540deg)', opacity: '0' } },
        blink: { '0%,92%,100%': { transform: 'scaleY(1)' }, '95%': { transform: 'scaleY(0.1)' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        wiggle: 'wiggle 2.5s ease-in-out infinite',
        pop: 'pop 0.4s ease-out both',
        confetti: 'confetti 1.6s ease-in forwards',
        blink: 'blink 4s infinite',
      },
    },
  },
  plugins: [],
};
