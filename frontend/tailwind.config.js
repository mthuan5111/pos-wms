/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        foreground: '#000000',
        background: '#FFFFFF',
        muted: '#F5F5F5',
        'muted-foreground': '#525252',
        'border-light': '#E5E5E5',
        accent: '#000000',
        'accent-foreground': '#FFFFFF',
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
      },
      borderWidth: {
        'hairline': '1px',
        'thin': '1px',
        'medium': '2px',
        'thick': '4px',
        'ultra': '8px',
      },
    },
  },
  plugins: [],
}