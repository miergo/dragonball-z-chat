import { defineConfig } from "vite";

// GitHub Pages serves this repo at /dragonball-z-chat/. Local dev stays at /.
const pagesBase = process.env.PAGES_BASE;

export default defineConfig({
  root: ".",
  publicDir: "media",
  base: pagesBase && pagesBase.length > 0 ? pagesBase : "/",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const type = proxyRes.headers["content-type"];
            if (typeof type === "string" && type.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
  },
});
