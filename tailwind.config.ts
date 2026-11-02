import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        panel: 'var(--bg-panel)',
        panel2: 'var(--bg-panel-2)',
        hover: 'var(--bg-hover)',
        line: 'var(--border)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        accentdark: 'var(--accent-shadow)',
        boardlight: 'var(--board-light)',
        boarddark: 'var(--board-dark)',
      },
      borderRadius: { base: 'var(--radius)' },
      fontFamily: {
        sans: ['Inter', 'Noto Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
