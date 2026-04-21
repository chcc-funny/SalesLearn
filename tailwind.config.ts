import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui CSS variable colors
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "#FFF5F0",
          100: "#FFE8DC",
          200: "#FFD0B8",
          300: "#FFB08A",
          400: "#E8845A",
          500: "#D97757",
          600: "#C4633F",
          700: "#A34E2E",
          800: "#7D3A20",
          900: "#5C2A16",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Semantic
        success: {
          DEFAULT: "#16A34A",
          bg: "#F0FDF4",
        },
        warning: {
          DEFAULT: "#CA8A04",
          bg: "#FEFCE8",
        },
        error: {
          DEFAULT: "#DC2626",
          bg: "#FEF2F2",
        },
        info: {
          DEFAULT: "#2563EB",
          bg: "#EFF6FF",
        },
        // Surface
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F5F5F0",
        },
        // Text
        text: {
          primary: "#1C1917",
          secondary: "#78716C",
          tertiary: "#A8A29E",
          disabled: "#D6D3D1",
          "on-primary": "#FFFFFF",
        },
        // Feynman
        feynman: {
          a: "#D97757",
          b: "#7C3AED",
        },
        // Radar chart
        radar: {
          complete: "#D97757",
          accurate: "#2563EB",
          clear: "#16A34A",
          analogy: "#CA8A04",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        modal: "0 20px 60px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
