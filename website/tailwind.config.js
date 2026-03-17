/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brain-dark': '#0a0a0a',
        'brain-darker': '#050505',
        'brain-white': '#ffffff',
        'brain-accent': '#ff2d95',
        'brain-cyan': '#00f0ff',
        'brain-yellow': '#fff200',
        'pink': '#ff2d95',
        'cyan': '#00f0ff',
        'yellow': '#fff200',
      },
      fontFamily: {
        'brain': ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'brain': '0 10px 40px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(255, 255, 255, 0.1)',
        'brain-lg': '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 0 3px rgba(255, 255, 255, 0.15)',
        'brain-glow': '0 0 20px rgba(255, 45, 149, 0.6), 0 0 40px rgba(255, 45, 149, 0.4)',
      },
      textShadow: {
        'brain': '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
        'brain-sm': '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
      },
      animation: {
        'glitch': 'glitch 1s infinite linear alternate-reverse',
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        glitch: {
          '0%': { transform: 'translate(0)', textShadow: '-2px -2px 0 #ff2d95, 2px -2px 0 #00f0ff' },
          '20%': { transform: 'translate(-2px, 2px)', textShadow: '2px 2px 0 #ff2d95, -2px 2px 0 #00f0ff' },
          '40%': { transform: 'translate(-2px, -2px)', textShadow: '-2px 2px 0 #ff2d95, 2px -2px 0 #00f0ff' },
          '60%': { transform: 'translate(2px, 2px)', textShadow: '2px -2px 0 #ff2d95, -2px -2px 0 #00f0ff' },
          '80%': { transform: 'translate(2px, -2px)', textShadow: '-2px -2px 0 #00f0ff, 2px 2px 0 #ff2d95' },
          '100%': { transform: 'translate(0)', textShadow: '-2px -2px 0 #000, 2px -2px 0 #000' },
        }
      }
    },
  },
  plugins: [],
}
