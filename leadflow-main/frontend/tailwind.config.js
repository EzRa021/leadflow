/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ─────────────────────────────────────────────────────────────
        // LeadFlow brand tokens — remapped to the exact values from the
        // Stitch "LeadFlow Outreach Console" project design theme so the
        // whole app matches the Stitch designs pixel-for-pixel. Names are
        // preserved so existing components inherit the new values.
        // ─────────────────────────────────────────────────────────────
        canvas: "#0F1115",          // Stitch: background
        surface: "#16191E",         // Stitch: surface (page cards)
        "surface-2": "#1e2024",     // Stitch: surface-container (raised/inputs)
        "surface-3": "#282a2e",     // Stitch: surface-container-high (chips)
        line: "#1F2937",            // Stitch: border
        ink: "#e2e2e8",             // Stitch: on-surface
        "ink-muted": "#94A3B8",     // Stitch: muted-text
        teal: "#6bd8cb",            // Stitch: primary (accents, active states)
        "teal-accent": "#14B8A6",   // Stitch: teal-accent (CTAs, interactive)
        "teal-dim": "rgba(107,216,203,0.12)",
        indigo: "#6366F1",          // Stitch: indigo-accent
        "indigo-dim": "rgba(99,102,241,0.12)",
        amber: "#F59E0B",           // Stitch: amber-warning
        "amber-dim": "rgba(245,166,35,0.12)",
        rose: "#E11D48",            // Stitch: rose-error
        "rose-dim": "rgba(225,29,72,0.12)",

        // Material-3 tokens straight from the Stitch theme, so screen markup
        // ported from Stitch (bg-surface-container-*, text-on-surface-variant,
        // border-outline-variant, etc.) resolves to the exact same colors.
        "surface-container-lowest": "#0c0e12",
        "surface-container-low": "#1a1c20",
        "surface-container": "#1e2024",
        "surface-container-high": "#282a2e",
        "surface-container-highest": "#333539",
        "surface-variant": "#333539",
        "surface-dim": "#111317",
        "surface-bright": "#37393e",
        "on-surface": "#e2e2e8",
        "on-surface-variant": "#bcc9c6",
        "on-background": "#e2e2e8",
        "primary-container": "#29a195",
        "on-primary-container": "#00302b",
        "on-primary": "#003732",
        "muted-text": "#94A3B8",
        outline: "#879391",
        "outline-variant": "#3d4947",
        "amber-warning": "#F59E0B",
        "rose-error": "#E11D48",
        "indigo-accent": "#6366F1",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
        // Stitch type-family aliases (headings = Space Grotesk, everything
        // else = Inter) so ported Stitch markup classes resolve.
        "headline-xl": ["'Space Grotesk'", "sans-serif"],
        "headline-lg": ["'Space Grotesk'", "sans-serif"],
        "headline-md": ["'Space Grotesk'", "sans-serif"],
        "headline-lg-mobile": ["'Space Grotesk'", "sans-serif"],
        "body-lg": ["'Inter'", "sans-serif"],
        "body-md": ["'Inter'", "sans-serif"],
        "body-sm": ["'Inter'", "sans-serif"],
        "label-md": ["'Inter'", "sans-serif"],
      },
      // Exact Stitch type scale (size / line-height / tracking / weight).
      fontSize: {
        "headline-xl": ["36px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-lg-mobile": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "headline-md": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        ping: {
          "75%, 100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        ping: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
