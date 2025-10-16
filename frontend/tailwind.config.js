/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        sidebar: "hsl(var(--sidebar))"
      },
      boxShadow: {
        soft: "0 2px 12px rgba(0,0,0,0.25)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: []
}
