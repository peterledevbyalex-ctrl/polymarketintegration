
//import type { Config } from 'tailwindcss'
//import { TailwindConfig } from "tailwindcss/tailwind-config"


export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: 'hsl(var(--color-primary))',
                    foreground: 'hsl(var(--color-primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--color-secondary))',
                    foreground: 'hsl(var(--color-secondary-foreground))',
                },
                tertiary: {
                    DEFAULT: 'hsl(10, 85%, 75%)',
                    foreground: 'hsl(0, 0%, 10%)',
                },
                neutral: {
                    DEFAULT: 'hsl(0, 0%, 97%)',
                    foreground: 'hsl(0, 0%, 10%)',
                },
                success: 'hsl(150, 65%, 45%)',
                warning: 'hsl(35, 95%, 55%)',
                gray: {
                    50: 'hsl(0, 0%, 98%)',
                    100: 'hsl(0, 0%, 94%)',
                    200: 'hsl(0, 0%, 87%)',
                    300: 'hsl(0, 0%, 75%)',
                    400: 'hsl(0, 0%, 60%)',
                    500: 'hsl(0, 0%, 45%)',
                    600: 'hsl(0, 0%, 35%)',
                    700: 'hsl(0, 0%, 25%)',
                    800: 'hsl(0, 0%, 15%)',
                    900: 'hsl(0, 0%, 7%)',
                },
                background: 'hsl(var(--color-background))',
                "background-light": 'hsl(var(--color-background-light))',
                "background-light-4xs": 'hsl(var(--color-background-light-4xs))',
                "background-light-3xs": 'hsl(var(--color-background-light-3xs))',
                "background-light-2xs": 'hsl(var(--color-background-light-2xs))',
                "background-light-xs": 'hsl(var(--color-background-light-xs))',
                "background-light-sm": 'hsl(var(--color-background-light-sm))',
                "background-light-md": 'hsl(var(--color-background-light-md))',
                "background-light-xl": 'hsl(var(--color-background-light-xl))',
                "background-light-2xl": 'hsl(var(--color-background-light-2xl))',
                "background-light-3xl": 'hsl(var(--color-background-light-3xl))',
                "background-btn": 'hsl(var(--color-background-btn))',
                foreground: 'hsl(var(--color-foreground))',
                "foreground-light": 'hsl(var(--color-foreground-light))',
                "foreground-light-xs": 'hsl(var(--color-foreground-light-xs))',
                "foreground-light-sm": 'hsl(var(--color-foreground-light-sm))',
                "foreground-light-md": 'hsl(var(--color-foreground-light-md))',
                "foreground-light-xl": 'hsl(var(--color-foreground-light-xl))',
                border: 'hsl(var(--color-border))',
                input: 'hsl(var(--color-input))',
                ring: 'hsl(var(--color-ring))',
                card: {
                    DEFAULT: 'hsl(var(--color-card))',
                    foreground: 'hsl(var(--color-card-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--color-popover))',
                    foreground: 'hsl(var(--color-popover-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--color-muted))',
                    foreground: 'hsl(var(--color-muted-foreground))',
                },
                accent: {
                    DEFAULT: 'hsl(var(--color-accent))',
                    foreground: 'hsl(var(--color-accent-foreground))',
                },
            },
            fontFamily: {
                sans: ['"DM Sans"', 'sans-serif'],
                body: ['"Inter"', 'sans-serif'],
            },
            spacing: {
                '4': '1rem',
                '8': '2rem',
                '12': '3rem',
                '16': '4rem',
                '24': '6rem',
                '32': '8rem',
                '48': '12rem',
                '64': '16rem',
            },
            borderRadius: {
                lg: '12px',
                md: '8px',
                sm: '4px',
            },
            backgroundImage: {
                'gradient-1': 'linear-gradient(135deg, hsl(270, 75%, 90%) 0%, hsl(10, 90%, 90%) 100%)',
                'gradient-2': 'linear-gradient(135deg, hsl(270, 70%, 68%) 0%, hsl(310, 70%, 75%) 100%)',
                'gradient-dark': 'linear-gradient(135deg, hsl(270, 40%, 15%) 0%, hsl(10, 50%, 20%) 100%)',
                'button-border-gradient': 'linear-gradient(90deg, hsl(260, 65%, 60%) 0%, hsl(290, 70%, 65%) 100%)',
            },
        },
    },
    plugins: [],
} /* satisfies TailwindConfig */;
