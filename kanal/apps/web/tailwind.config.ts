import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(214 32% 91%)',
        muted: 'hsl(210 40% 96%)',
        'muted-foreground': 'hsl(215 16% 47%)',
        primary: 'hsl(199 89% 48%)',
        'primary-foreground': 'hsl(0 0% 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
