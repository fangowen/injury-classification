import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#aab3c2",
          400: "#7c8699",
          500: "#586275",
          600: "#3f4859",
          700: "#2c3342",
          800: "#1c212c",
          900: "#11141c",
        },
        accent: {
          DEFAULT: "#3e7cf0",
          hover: "#2d63cc",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
