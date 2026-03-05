/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta principal Salesianos
        brand: {
          50: "#fff1f1",
          100: "#ffe0e0",
          200: "#ffc5c5",
          300: "#ff9e9e",
          400: "#ff6464",
          500: "#f81d1d", // rojo principal
          600: "#e00d0d",
          700: "#bc0808",
          800: "#9b0b0b",
          900: "#810f0f",
          950: "#460303",
        },
        surface: {
          0: "#ffffff",
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e8e8e8",
          300: "#d4d4d4",
        },
      },
      fontFamily: {
        display: ['"Roboto"', "sans-serif"],
        body: ['"Roboto"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / .07), 0 1px 2px -1px rgb(0 0 0 / .07)",
        "card-hover":
          "0 4px 12px 0 rgb(0 0 0 / .10), 0 2px 4px -1px rgb(0 0 0 / .06)",
        brand: "0 4px 14px 0 rgb(248 29 29 / .30)",
      },
      borderRadius: {
        xl2: "1rem",
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
