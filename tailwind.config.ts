// /** @type {import('tailwindcss').Config} */
// export default {
//   content: [
//     "./index.html",
//     "./src/**/*.{js,ts,jsx,tsx}",
//     "./src/**/*.{html,js,ts,jsx,tsx}"
//   ],
//   theme: {
//     extend: {
//       fontFamily: {
//         sans: ["Inter", "sans-serif"],
//       },
//     },
//   },
//   plugins: [],
// };


/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{html,js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      backgroundSize: {
        '200%': '200% 200%',
      },
      keyframes: {
        gradientMove: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      animation: {
        gradientMove: 'gradientMove 8s ease infinite',
      },
      colors: {
        // Optional: extra vibrant colors for gradients
        rosePink: '#ff6b81',
        lavender: '#b784f4',
        aquaBlue: '#4facfe',
        peach: '#ff9a9e',
        limeGreen: '#a8e063',
        golden: '#f6d365',
      },
    },
  },
  plugins: [],
};


