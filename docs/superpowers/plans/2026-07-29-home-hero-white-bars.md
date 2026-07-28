# Home Hero 首屏白条修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除首页 Hero 在首屏 CSS/脚本完成前因 `max-width` 父级约束而出现的两侧露底，同时保持现有 Hero 和导航栏视觉效果。

**Architecture:** 给首页主内容父级添加稳定的语义 class，并在 `Layout.astro` 的 `<head>` 内联一组仅针对首页的关键布局规则，让父级在首屏就全宽；完整的 `home-hero.css` 和现有 `DOMContentLoaded` 逻辑继续负责最终样式与导航后的布局同步。不会改动 Hero 的 `100vw` 视觉实现，也不调整导航栏的 `max-width`。

**Tech Stack:** Astro 6.4.6、纯 CSS、Swup 页面过渡、pnpm build（当前环境使用已安装 Astro CLI 等价执行验证）。

## Global Constraints

- 不改变 Hero 全屏背景图和三栏布局。
- 不改变导航栏 `max-width: var(--page-width)` 限制。
- 不新增 `!important`，不使用硬编码 `#000`/`#fff`。
- 样式必须通过 `src/styles/main.css` 或布局内已有样式入口生效；关键兜底仅限根布局 `<head>` 内联。
- 修改后必须运行完整构建验证。

---

### Task 1: 标记首页主内容全宽父级

**Files:**
- Modify: `src/layouts/MainGridLayout.astro:171`

**Interfaces:**
- Consumes: `isHomePageCheck`，现有 `max-w-(--page-width)` wrapper。
- Produces: `.home-main-grid-wrapper` class，供首屏关键 CSS 精确定位。

- [ ] **Step 1: Add the conditional semantic class**

  Change the wrapper from:

  ```astro
  <div class="relative max-w-(--page-width) mx-auto pointer-events-auto">
  ```

  to:

  ```astro
  <div class:list={["relative", "max-w-(--page-width)", "mx-auto", "pointer-events-auto", { "home-main-grid-wrapper": isHomePageCheck }]}>
  ```

### Task 2: Add head-level critical home layout CSS

**Files:**
- Modify: `src/layouts/Layout.astro:100-101`

**Interfaces:**
- Consumes: body class token `lg:is-home` and `.home-main-grid-wrapper` from Task 1.
- Produces: first-paint rules that remove only the home wrapper max-width and horizontal padding before the bundled stylesheet finishes loading.

- [ ] **Step 1: Add a small inline style block immediately inside `<head>`**

  Insert:

  ```astro
  <style is:inline>
    body[class~="lg:is-home"] .home-main-grid-wrapper {
      max-width: none;
    }

    body[class~="lg:is-home"] #main-grid {
      padding-inline: 0;
    }
  </style>
  ```

  The selector uses an attribute token match so the colon in `lg:is-home` needs no CSS escaping. No visual rules for the Hero or navbar are duplicated.

### Task 3: Verify the regression fix

**Files:**
- Test: generated `dist/index.html` and CSS output from the build.

- [ ] **Step 1: Inspect the source diff**

  Run `git diff -- src/layouts/Layout.astro src/layouts/MainGridLayout.astro` and confirm only the semantic class and two critical rules changed.

- [ ] **Step 2: Run the full build**

  Run `pnpm build` (or the installed Astro CLI equivalent when pnpm is unavailable). Expected: exit code 0; existing content/highlighting warnings may remain, but no build errors.

- [ ] **Step 3: Confirm built HTML contains the critical style before the body**

  Check `dist/index.html` and verify the inline selector occurs inside `<head>` and `.home-main-grid-wrapper` is present on the home wrapper.
