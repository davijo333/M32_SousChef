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
        background: "var(--background)",
        foreground: "var(--foreground)",
        chef: {
          cream: "#faf8f5",
          surface: "#ffffff",
          muted: "#f3efe8",
          border: "#e5ddd2",
          sage: "#4a6b52",
          "sage-dark": "#3a5542",
          "sage-light": "#e8f0ea",
          amber: "#b87a3d",
          "amber-light": "#faf3eb",
          text: "#2a2622",
          "text-muted": "#6d6760",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
