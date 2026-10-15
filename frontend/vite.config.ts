import { defineConfig } from "vite";
import { resolve } from "path";

// GitHub Pages serves this repo at /dragonball-z-chat/. Local dev stays at /.
const pagesBase = process.env.PAGES_BASE;

export default defineConfig({
  root: ".",
  publicDir: "public",
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
  build: {
    target: "esnext",
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-transformers": ["@xenova/transformers"],
          "vendor-webllm": ["@mlc-ai/web-llm"],
          "vendor-sqljs": ["sql.js"],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@xenova/transformers", "@mlc-ai/web-llm", "sql.js"],
    web: {
      async: true,
    },
  },
  worker: {
    format: "es",
    plugins: () => [],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});