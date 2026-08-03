import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: "server",
  adapter: vercel(),
  trailingSlash: "always",
  vite: {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "../src"),
      },
    },
  },
});
