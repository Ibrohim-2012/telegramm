import type { Config } from 'tailwindcss';

const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        raised: c('raised'),
        ink: c('ink'),
        muted: c('muted'),
        line: c('line'),
        accent: c('accent'),
        'accent-ink': c('accent-ink'),
        danger: c('danger'),
        ok: c('ok'),
        badge: c('badge'),
        'badge-on': c('badge-on'),
      },
      // Roboto only ships 400/500/700, so "semibold" maps to Telegram's medium (500).
      fontWeight: { semibold: '500' },
      fontFamily: {
        sans: ['var(--font-roboto)', 'Roboto', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(30px,-40px,0) scale(1.12)' } },
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        slide: { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        msg: { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        menu: { from: { opacity: '0', transform: 'scale(.86)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        float: 'float 14s ease-in-out infinite',
        rise: 'rise .45s cubic-bezier(.2,.8,.2,1) both',
        slide: 'slide .28s cubic-bezier(.2,.8,.2,1) both',
        msg: 'msg .18s ease-out both',
        menu: 'menu .16s cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop .25s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
