/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { 950: "#022C22", 900: "#064E3B" },
        emerald: { 600: "#059669" },
        mint: { 50: "#ECFDF5", 100: "#D1FAE5" },
        canvas: "#F7FAF8",
        ink: "#111827",
        muted: "#64748B",
        line: "#E5E7EB",
        danger: "#DC2626",
        warn: "#D97706",
        ok: "#16A34A",
      },
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(2,44,34,0.05)", pop: "0 8px 30px rgba(2,44,34,0.14)" },
    },
  },
  plugins: [],
};
