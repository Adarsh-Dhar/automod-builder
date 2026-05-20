/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        reddit: {
          orange: "#FF4500",
          "orange-hover": "#E03D00",
          dark: "#0D1117",
          darker: "#090D13",
          card: "#161B22",
          border: "#21262D",
          "text-primary": "#E6EDF3",
          "text-secondary": "#8B949E",
          "text-muted": "#484F58",
          green: "#3FB950",
          blue: "#58A6FF",
          yellow: "#D29922",
          red: "#F85149",
          purple: "#BC8CFF",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
