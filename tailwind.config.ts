import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // The logo is pure black and white, so the brand is monochrome: ink for
        // anything interactive, and a slightly warm grey scale around it. Colour
        // is reserved for meaning — green cash, blue card, red cost, amber credit
        // — so a number never competes with the chrome for attention.
        primary: {
          50: "#f7f7f6",
          100: "#ededeb",
          200: "#d9d9d5",
          300: "#b8b8b2",
          400: "#8c8c85",
          500: "#63635d",
          600: "#242422",
          700: "#191918",
          800: "#101010",
          900: "#0a0a0a",
          950: "#050505",
        },
        // Used only in the customer app; the shop's screens stay monochrome.
        brass: {
          50: "#fbf7ec",
          100: "#f3e9cd",
          200: "#e7d29c",
          300: "#d9b767",
          400: "#cfa243",
          500: "#c08f32",
          600: "#a17228",
          700: "#7f5722",
          800: "#5d3f1e",
          900: "#3d2a15",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 16 16 / 0.04), 0 1px 3px 0 rgb(16 16 16 / 0.06)",
        glow: "0 10px 30px -12px rgb(207 162 67 / 0.45)",
        lift: "0 20px 40px -24px rgb(0 0 0 / 0.8)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
