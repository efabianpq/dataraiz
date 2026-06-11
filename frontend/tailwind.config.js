/**
 * DataRaíz — Tokens de marca (Brand Guide).
 *
 * NOTA: Este proyecto usa Tailwind CSS v4, cuya configuración canónica vive en
 * `src/app/globals.css` dentro del bloque `@theme` (CSS-first). Este archivo
 * espeja esos tokens como referencia/documentación y para herramientas que
 * todavía leen un config JS. La fuente de verdad es globals.css.
 */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e4f4ef",
          100: "#c0e5d9",
          200: "#8dccb5",
          300: "#5db393",
          400: "#3a9673",
          500: "#3a9673",
          600: "#2d7a5f",
          700: "#226049",
          800: "#1b4d3e",
          900: "#0d2b22",
        },
        amber: {
          50: "#fbf3e0",
          100: "#f5e1b8",
          200: "#edca8a",
          300: "#e0ad59",
          500: "#d4943a",
          600: "#b3791c",
          700: "#8f6012",
        },
        terra: {
          50: "#fae2d4",
          100: "#f2bfa0",
          200: "#e89870",
          300: "#d4743e",
          500: "#c45c2a",
          600: "#b34520",
          700: "#8a3415",
        },
        data: {
          50: "#e0eaf8",
          100: "#bad1ee",
          200: "#82aedc",
          300: "#4a82c4",
          500: "#2563a8",
          600: "#1e4d8c",
          700: "#163a6b",
        },
        neutral: {
          50: "#faf8f5",
          100: "#f5f2ee",
          200: "#e2ddd9",
          300: "#c4bebb",
          400: "#a09895",
          500: "#79716e",
          600: "#5c5552",
          700: "#403b38",
          800: "#292422",
          900: "#1c1917",
        },
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1.05", fontWeight: "700" }],
        h1: ["2.25rem", { lineHeight: "1.1", fontWeight: "700" }],
        h2: ["1.75rem", { lineHeight: "1.2", fontWeight: "600" }],
        h3: ["1.375rem", { lineHeight: "1.3", fontWeight: "600" }],
        h4: ["1.125rem", { lineHeight: "1.4", fontWeight: "600" }],
        label: ["0.75rem", { lineHeight: "1.2", letterSpacing: "0.06em", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.08)",
        panel: "0 4px 16px rgba(13,43,34,0.08)",
        modal: "0 16px 48px rgba(13,43,34,0.24)",
        pin: "0 2px 6px rgba(0,0,0,0.35)",
      },
      spacing: {
        sidebar: "248px",
        header: "60px",
        "panel-p": "24px",
      },
    },
  },
  plugins: [],
};
