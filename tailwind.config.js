/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "rgb(var(--c-base-950) / <alpha-value>)",
          900: "rgb(var(--c-base-900) / <alpha-value>)",
          800: "rgb(var(--c-base-800) / <alpha-value>)",
          750: "rgb(var(--c-base-750) / <alpha-value>)",
          700: "rgb(var(--c-base-700) / <alpha-value>)",
          600: "rgb(var(--c-base-600) / <alpha-value>)",
        },
        accent: {
          500: "rgb(var(--c-accent-500) / <alpha-value>)",
          400: "rgb(var(--c-accent-400) / <alpha-value>)",
          glow: "rgb(var(--c-accent-glow) / <alpha-value>)",
        },
        cobalt: {
          500: "rgb(var(--c-cobalt-500) / <alpha-value>)",
          400: "rgb(var(--c-cobalt-400) / <alpha-value>)",
        },
        amber: {
          500: "rgb(var(--c-amber-500) / <alpha-value>)",
        },
        violet: {
          500: "rgb(var(--c-violet-500) / <alpha-value>)",
        },
        ink: {
          100: "rgb(var(--c-ink-100) / <alpha-value>)",
          200: "rgb(var(--c-ink-200) / <alpha-value>)",
          300: "rgb(var(--c-ink-300) / <alpha-value>)",
          400: "rgb(var(--c-ink-400) / <alpha-value>)",
          500: "rgb(var(--c-ink-500) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 60px -10px rgb(var(--c-accent-500) / 0.35)",
        "glow-lg": "0 0 80px -10px rgb(var(--c-accent-500) / 0.5)",
        card: "0 20px 60px -20px rgb(var(--c-shadow) / 0.6)",
        "glass": "0 8px 32px -8px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        "glass-hover": "0 20px 60px -16px rgba(0, 0, 0, 0.4), 0 0 30px -5px rgb(var(--c-accent-500) / 0.15)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(180deg, rgb(var(--c-accent-500) / 0.06) 0%, rgb(var(--c-base-950) / 0) 60%)",
      },
      animation: {
        "spin-slow": "spin 20s linear infinite",
      },
    },
  },
  plugins: [],
};
