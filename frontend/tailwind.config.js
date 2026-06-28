/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          dark: "var(--color-brand-dark)",
          50: "#fff5f4",
          100: "#ffe7e4",
          200: "#ffcfc9",
          300: "#ffa9a0",
          400: "#ff7468",
          500: "#f43f32",
          600: "#e01f16",
          700: "#bd1710",
          800: "#981711",
          900: "#7e1915",
          950: "#450806",
        },
        muted: "var(--color-muted)",
        foreground: "var(--color-foreground)",
        charcoal: {
          50: "#f6f6f4",
          100: "#e8e8e3",
          200: "#d1d1c8",
          300: "#aeaea3",
          400: "#87877a",
          500: "#6b6b61",
          600: "#55554d",
          700: "#44443f",
          800: "#292927",
          900: "#1c1c1a",
          950: "#111110",
        },
        border: {
          DEFAULT: "var(--color-border)",
        },
        surface: {
          0: "#ffffff",
          50: "#fbfaf8",
          100: "#f4f3ef",
          200: "#e8e6df",
          300: "#d6d2c8",
        },
      },
      fontFamily: {
        display: ['"Roboto"', "sans-serif"],
        body: ['"Roboto"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(17 17 16 / .05)",
        "card-hover":
          "0 8px 20px -18px rgb(17 17 16 / .32), 0 1px 4px -3px rgb(17 17 16 / .16)",
        brand: "0 10px 18px -12px rgb(224 31 22 / .65)",
        shell: "0 20px 45px -30px rgb(17 17 16 / .45)",
      },
      borderRadius: {
        xl2: "0.5rem",
      },
      animation: {
        "slide-in": "slideIn 0.2s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        slideIn: {
          from: { transform: "translateY(-6px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
    },
  },
  plugins: [],
};
