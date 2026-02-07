/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stairs: {
          navy: '#0a1628',
          deep: '#0f1f3a',
          surface: '#162544',
          border: '#1e3a5f',
          gold: '#d4a853',
          amber: '#e8b94a',
          cream: '#f5e6c8',
          success: '#34d399',
          risk: '#fbbf24',
          danger: '#f87171',
          info: '#60a5fa',
        }
      },
      fontFamily: {
        display: ['Instrument Serif', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        arabic: ['Noto Kufi Arabic', 'Tahoma', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
