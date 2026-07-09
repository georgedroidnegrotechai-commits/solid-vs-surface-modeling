/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cad-solid': '#1e40af',
        'cad-surface': '#854d0e',
      }
    },
  },
  plugins: [],
}
