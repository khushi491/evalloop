import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      colors: {
        border: "hsl(215 16% 22%)",
        input: "hsl(215 16% 22%)",
        ring: "hsl(212 95% 68%)",
        background: "hsl(222 47% 7%)",
        foreground: "hsl(210 40% 98%)",
        muted: {
          DEFAULT: "hsl(215 15% 15%)",
          foreground: "hsl(215 20% 65%)"
        },
        card: {
          DEFAULT: "hsl(222 47% 9%)",
          foreground: "hsl(210 40% 98%)"
        },
        accent: {
          DEFAULT: "hsl(212 95% 68%)",
          foreground: "hsl(222 47% 7%)"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem"
      },
      boxShadow: {
        "soft": "0 18px 45px rgba(15, 23, 42, 0.65)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;

