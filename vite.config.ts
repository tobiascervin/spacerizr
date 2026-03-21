import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  // Library build: `vite build --mode lib`
  if (mode === "lib") {
    return {
      build: {
        outDir: "dist-lib",
        lib: {
          entry: {
            api: resolve(__dirname, "src/api.ts"),
            embed: resolve(__dirname, "src/embed.ts"),
          },
          formats: ["es"],
        },
        rollupOptions: {
          // Don't bundle three.js — let consumers handle it
          external: ["three"],
        },
      },
    };
  }

  // Default: App build (static site)
  return {
    root: ".",
    build: {
      outDir: "dist",
    },
  };
});
