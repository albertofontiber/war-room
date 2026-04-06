import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design system — War Room dark theme
        wr: {
          bg:         "#0f1117",
          surface:    "#161b27",
          surface2:   "#1a2035",
          border:     "#2d3548",
          blue:       "#3b82f6",
          "blue-light": "#7baaf7",
          amber:      "#f59e0b",
          green:      "#22c55e",
          red:        "#ef4444",
          text:       "#e2e8f0",
          muted:      "#94a3b8",
          hint:       "#4a5568",
        },
        // shadcn/ui CSS variable mappings
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      // CRM stage colors for markers
      keyframes: {
        "pulse-amber": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(245, 158, 11, 0.5)" },
          "50%": { boxShadow: "0 0 0 8px rgba(245, 158, 11, 0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-amber": "pulse-amber 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    // shadcn/ui components use outline-ring/* opacity modifiers — define it here
    function ({ addUtilities, theme }: { addUtilities: (u: Record<string, Record<string,string>>) => void; theme: (k: string) => Record<string,string> }) {
      addUtilities({
        ".outline-ring\\/50": {
          "outline-color": "rgb(59 130 246 / 0.5)",
        },
      });
    },
  ],
};
export default config;
