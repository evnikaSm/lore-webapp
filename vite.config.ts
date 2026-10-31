import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          storage: ["dexie"],
          cloud: ["@supabase/supabase-js"],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["lore-favicon-32.png", "lore-apple-touch-icon.png", "lore-icon-192.png", "lore-icon-512.png", "lore-icon-maskable.png"],
      manifest: {
        name: "Мой книжный год",
        short_name: "Книжный год",
        description: "Ваш спокойный ритм чтения",
        lang: "ru",
        theme_color: "#F8F6EF",
        background_color: "#F8F6EF",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/lore-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/lore-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/lore-icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
});
