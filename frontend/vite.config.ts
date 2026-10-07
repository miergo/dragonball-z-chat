import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "media",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
