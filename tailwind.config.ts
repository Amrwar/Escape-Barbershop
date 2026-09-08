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
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 16 16 / 0.04), 0 1px 3px 0 rgb(16 16 16 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
