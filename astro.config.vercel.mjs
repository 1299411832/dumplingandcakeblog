// Vercel 专用构建配置（带 adapter，API 路由可用）
// 在线测试用，正式上线后 EdgeOne 用主配置 astro.config.mjs

import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// 复用主配置的 integrations 和 markdown 设置（简化版）
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import swup from "@swup/astro";
import icon from "astro-icon";
import mdx from "@astrojs/mdx";
import expressiveCode from "astro-expressive-code";

import { expressiveCodeConfig, siteConfig } from "./src/config";

export default defineConfig({
  site: siteConfig.site_url,
  adapter: vercel(),
  base: "/",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  image: { experimentalLayout: "constrained" },
  integrations: [
    swup({
      theme: false,
      animationClass: "transition-swup-",
      containers: ["#banner-overlay-container", "#banner-dim-container", "#swup-container", "#left-sidebar-dynamic", "#right-sidebar-dynamic"],
      smoothScrolling: false, cache: true, preload: true, accessibility: true,
      updateHead: true, updateBodyClass: false, globalInstance: true,
      resolveUrl: (url) => url, animateHistoryBrowsing: false,
      skipPopStateHandling: (event) => event.state && event.state.url && event.state.url.includes("#"),
    }),
    icon({ include: { "material-symbols": ["*"], "fa7-brands": ["*"], "fa7-regular": ["*"], "fa7-solid": ["*"], "simple-icons": ["*"], mdi: ["*"] } }),
    expressiveCode({ themes: [expressiveCodeConfig.darkTheme, expressiveCodeConfig.lightTheme], useDarkModeMediaQuery: false }),
    svelte(),
    sitemap({ filter: (page) => { const pathname = new URL(page).pathname; if (pathname === "/sponsor/" && !siteConfig.pages.sponsor) return false; if (pathname === "/guestbook/" && !siteConfig.pages.guestbook) return false; if (pathname === "/bangumi/" && !siteConfig.pages.bangumi) return false; return true; } }),
    mdx(),
  ],
  vite: { plugins: [tailwindcss()] },
});
