/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Paths to all templates
  ],
  theme: {
    extend: {
      keyframes: {
        'confetti-fall': {
          '0%': {
            transform: 'translateY(-100%) rotate(0deg)',
            opacity: 1
          },
          '100%': {
            transform: 'translateY(1000%) rotate(720deg)',
            opacity: 0
          }
        }
      },
      animation: {
        'confetti-fall': 'confetti-fall 2s ease-out forwards'
      }
    }
  },
  plugins: [],
};