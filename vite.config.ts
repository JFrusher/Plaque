import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build runs from file:// or any static subpath (GitHub Pages).
  base: "./",
  assetsInclude: ["**/*.ttf", "**/*.otf"],
  test: {
    // core/ is pure TS and render/pdf runs headless; nothing needs a DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
