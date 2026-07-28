# AGENTS.md — Firefly 博客工程规范

> 本文件是 AI 助手在本仓库中工作的唯一权威指令。所有开发行为必须遵守以下规范。

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 名称 | Firefly v6.6.13 — "团子和蛋糕的博客" |
| 框架 | Astro 6.4.6 + Svelte 5 + Tailwind CSS v4 |
| 包管理 | pnpm 9.14.4 (ESM, `preinstall` 强制) |
| 运行时 | Node.js >= 22 |
| 部署 | Vercel（主）+ GitHub Pages（CI） |
| 线上 | https://blog.tsh520.cn/ |
| 来源 | Fork 自 CuteLeaf/Firefly ← saicaca/fuwari，已深度定制为独立演化 |

---

## 2. 目录结构

```
src/
├── assets/images/       # 头像、封面等构建时图片
├── components/          # 按功能域组织的组件（117 个文件）
│   ├── analytics/       # GA, Clarity, Umami (3)
│   ├── comment/         # 评论系统：index + 5 种后端 + 3 个弹窗组件 (9)
│   ├── common/          # 跨域共享基础组件 (16)
│   ├── controls/        # 交互控件：搜索、归档、主题、Dock (8)
│   ├── features/        # 独立功能模块 (23, 含 music-visualizer/)
│   ├── layout/          # 布局组件：Navbar, Footer, SideBar, HomeHero... (16)
│   ├── misc/            # License, RelatedPosts, SharePoster (3)
│   ├── moments/         # 动态卡片 (2)
│   ├── pages/           # 页面级组件：bangumi, books, movies-games, music (10)
│   └── widget/          # 侧栏 Widget (27)
├── config/              # 站点配置（29 个文件，index.ts barrel export）
├── constants/           # 常量：页面尺寸、主题模式、图标、链接预设
├── content/             # Astro Content Collections（12 个集合）
│   ├── album/ apps/ bangumi/ changelog/ daohang/
│   ├── friends/ life/ moments/ posts/ spec/ ziyuan/
├── i18n/                # 国际化（5 种语言，290 个翻译键）
│   └── languages/       # en.ts, zh_CN.ts, zh_TW.ts, ja.ts, ru.ts
├── layouts/             # Layout.astro (555行), MainGridLayout.astro (303行)
├── notes/               # Obsidian 笔记（不发布）
├── pages/               # 路由（45 个文件）
│   ├── admin/           # 管理后台 (7)
│   ├── api/             # JSON API (1)
│   ├── album/ bangumi/ books/ categories/ life/ moments/ posts/
│   └── 404, about, archive, apps, changelog, circle, friends,
│       guestbook, music, projects, search, sponsor, rss, robots.txt, og
├── plugins/             # 自定义 remark/rehype 插件 (10)
├── styles/              # CSS 样式（58 个文件）
│   ├── tokens/          # 设计令牌：colors, breakpoints, animation, z-index
│   ├── base/            # reset, utilities
│   ├── components/      # 组件样式
│   ├── features/        # 功能样式
│   ├── layout/          # 布局样式
│   ├── pages/           # 页面样式
│   ├── transitions/     # Swup 过渡动画
│   └── vendor/          # 第三方覆盖
├── types/               # TypeScript 类型：config.ts, bangumi.ts, guestbook-chat.ts
└── utils/               # 工具函数（18 个文件）
    ├── 8 个控制器模块   # 见第 10 节
    └── 10 个业务工具    # content-utils, date-utils, image-utils, url-utils...
```

**禁止在 `components/` 根目录平铺组件文件，必须放入对应功能域子目录。**

---

## 3. 核心架构

### 3.1 布局继承链

```
Layout.astro          ← HTML 骨架：<html>, <head>, <body>, 全局组件, 主题初始化
  └─ MainGridLayout.astro  ← 页面结构：Navbar, 侧栏网格, Footer, 看板娘
       └─ 页面组件          ← 具体内容：首页、文章、分类...
```

- `Layout.astro`：负责 `<head>`、主题初始化（内联 `<script is:inline>`）、全局组件挂载（PageLoader, MusicManager, FancyboxManager, SearchModal, SakuraEffect）
- `MainGridLayout.astro`：负责导航栏、侧栏网格系统、Footer、SpineModel、Live2DWidget
- 页面组件：继承 `MainGridLayout`，通过 `<slot>` 注入内容

### 3.2 Swup 页面过渡

使用 `@swup/astro` 实现 SPA 式导航，5 个容器：
```
#banner-overlay-container, #banner-dim-container,
#swup-container, #left-sidebar-dynamic, #right-sidebar-dynamic
```

容器外的组件（FloatingDock, MobileDock, MusicManager, SearchModal）跨导航持久化。

### 3.3 主题系统

- 三种模式：light / dark / system
- OKLCH 色彩空间 + CSS 自定义属性
- 令牌定义在 `src/styles/tokens/colors.css`（`:root` 浅色 + `:root.dark` 深色）
- Hue 可配置（`siteConfig.themeColor.hue`），映射到 oklch 的 H 参数
- 切换主题时使用 View Transition API 保护动画

### 3.4 Content Collections

12 个集合定义在 `src/content.config.ts`，使用 Zod schema 校验：

| 集合 | 用途 |
|------|------|
| posts | 博客文章 |
| spec | 特殊页面（about, friends, guestbook, privacy, user-agreement） |
| moments | 说说/动态 |
| bangumi | 番组/书籍/音乐/游戏追踪 |
| life | 生活记录 |
| notebooks | 笔记本（life 的子集） |
| album | 相册 |
| daohang | 导航链接 |
| ziyuan | 资源/公告 |
| friends | 友链 |
| apps | 应用 |
| changelog | 更新日志 |

---

## 4. 样式规范

### 4.1 入口文件

`src/styles/main.css` 是唯一合法入口，结构：

```css
@import 'tailwindcss';        /* Tailwind v4 核心 */
@plugin '@tailwindcss/typography';
@custom-variant dark (&:where(.dark, .dark *));

/* 设计令牌 */
@import './tokens/colors.css';
@import './tokens/breakpoints.css';
@import './tokens/animation.css';
@import './tokens/z-index.css';

/* 基础 */
@import './base/reset.css';
@import './base/utilities.css';

/* 组件 → 功能 → 布局 → 过渡 → 第三方 */
```

### 4.2 硬性规则

- **禁止**在组件外新建独立 CSS 文件，所有样式必须通过 `main.css` 导入
- **禁止**使用 Stylus（已迁移完毕），统一用纯 CSS
- **禁止**新建 `!important`（现有 465 处是历史遗留，新代码不得增加）
- **禁止**使用 `#000`/`#fff` 硬编码颜色，必须用 `var(--*)` 令牌
- 暗色模式选择器统一使用 `:root.dark`（不要用 `.dark`、`html.dark`、`@media (prefers-color-scheme)`）
- `@apply` 仅在无法用 Tailwind class 实现时使用（如 CSS 伪元素）

### 4.3 颜色令牌速查

| 令牌 | 用途 |
|------|------|
| `--page-bg` | 页面背景 |
| `--card-bg` | 卡片背景 |
| `--deep-text` | 主要文字 |
| `--content-meta` | 次要文字 |
| `--primary` | 主题色 |
| `--btn-regular-bg` | 按钮背景 |
| `--btn-content` | 按钮文字 |
| `--line-divider` | 分割线 |
| `--float-panel-bg` | 浮动面板背景 |
| `--border` | 边框色 |

---

## 5. 组件开发规范

### 5.1 文件命名

- Astro 组件：PascalCase（`HomeHero.astro`）
- Svelte 组件：PascalCase（`SearchModal.svelte`）
- 工具函数：kebab-case（`scroll-handler.ts`）
- 样式文件：kebab-case（`home-hero.css`）
- 配置文件：camelCase（`siteConfig.ts`）

### 5.2 Astro vs Svelte 选择

| 场景 | 选择 |
|------|------|
| 纯静态 HTML + 服务端数据 | Astro |
| 简单交互（折叠、切换） | Astro + `<script>` |
| 复杂状态管理、响应式更新 | Svelte (`client:load` 或 `client:visible`) |

### 5.3 Hydration 指令

| 指令 | 用途 | 注意 |
|------|------|------|
| `client:load` | 立即水合 | 仅用于首屏必须交互的组件（如 SearchModal） |
| `client:visible` | 进入视口时水合 | 推荐用于非首屏组件 |
| `client:idle` | 浏览器空闲时水合 | 低优先级组件 |
| `client:only="svelte"` | 跳过 SSR | 需要浏览器 API 的组件 |

**Swup 容器内（`#swup-container`）的组件避免 `client:load`，因为每次导航都会重新挂载。**

---

## 6. 配置系统

29 个配置文件，通过 `src/config/index.ts` barrel export。

### 核心配置

| 配置文件 | 导出名 | 用途 |
|----------|--------|------|
| `siteConfig.ts` | `siteConfig` | 标题、URL、语言、主题色、页面开关、分析、图片优化 |
| `profileConfig.ts` | `profileConfig` | 个人信息：头像、昵称、职业、简介 |
| `navBarConfig.ts` | `navBarConfig`, `navBarSearchConfig` | 导航栏链接（根据页面开关动态生成） |
| `sidebarConfig.ts` | `sidebarLayoutConfig` | 侧栏布局：左/右/双侧栏、组件列表 |
| `commentConfig.ts` | `commentConfig` | 评论系统选择（Waline/Twikoo/Giscus/Disqus/Artalk） |
| `musicConfig.ts` | `musicPlayerConfig` | 音乐播放器：Meting API 或本地播放列表 |
| `backgroundWallpaper.ts` | `backgroundWallpaper` | 背景图配置（当前 mode: "none"，不渲染 banner） |
| `homePortfolioShutterConfig.ts` | `homePortfolioShutterConfig` | 首页作品集百叶窗配置 |

### 其他配置

`adConfig`, `announcementConfig`, `circleConfig`, `coverImageConfig`, `expressiveCodeConfig`, `fontConfig`, `footerConfig`, `friendsConfig`, `guestbookConfig`, `licenseConfig`, `pioConfig`(Live2D/Spine), `relationshipConfig`, `sakuraConfig`, `skillsConfig`, `sponsorConfig`

### 外部配置（直接导入，不经 barrel）

`externalBangumiConfig`, `externalFriendsConfig`, `externalMomentsConfig`, `externalNotebooksConfig`, `externalPlacesConfig`

---

## 7. i18n 国际化

### 结构

```
src/i18n/
├── i18nKey.ts       # 290 个翻译键枚举
├── translation.ts   # 翻译加载器（回退链：当前语言 → zh_CN → en）
└── languages/       # en.ts, zh_CN.ts, zh_TW.ts, ja.ts, ru.ts
```

### 使用

```typescript
import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";
// 使用
{i18n(I18nKey.someKey)}
```

### 硬性规则

添加新 i18n 键时，**必须在所有 5 个语言文件中添加翻译**。缺失翻译会回退到中文，对非中文用户是 bug。

---

## 8. 事件监听器规范（关键）

### 8.1 必须清理的场景

| 场景 | 清理方式 |
|------|---------|
| Svelte `onMount` 中的 `addEventListener` | 返回清理函数 |
| Swup 容器内组件的事件 | `AbortController`，导航时 abort |
| `setInterval` | cleanup 中 `clearInterval` |
| `requestAnimationFrame` 循环 | cleanup 中 `cancelAnimationFrame` |
| `MutationObserver` / `ResizeObserver` | cleanup 中 `disconnect()` |

### 8.2 AbortController 模式

```typescript
let abortCtrl: AbortController | null = null;

function bindEvents() {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const signal = abortCtrl.signal;
    document.addEventListener("click", handler, { signal });
    window.addEventListener("resize", handler, { signal });
}

document.addEventListener("swup:content:replaced", bindEvents);
```

### 8.3 禁止的模式

```javascript
// ❌ 匿名函数监听器（无法移除）
window.addEventListener("scroll", () => { ... });

// ❌ inline script 中注册监听器但不清理
<script is:inline>
window.addEventListener("resize", handleResize); // 永远不移除
</script>

// ❌ Swup 钩子重复注册无 guard
window.swup.hooks.on("content:replace", myHandler); // 每次导航都注册新的
```

---

## 9. 单例与 Guard 变量

### 9.1 全局单例模式

跨 Swup 导航持久化的功能必须使用 `window.__xxx` guard：

```javascript
<script is:inline data-swup-ignore-script>
(function() {
    if (window.__fireflyMusic) return;  // 单例 guard
    // ... 初始化 ...
    window.__fireflyMusic = { /* API */ };
})();
</script>
```

### 9.2 已注册的 Guard 变量

| Guard | 功能 | 文件 |
|-------|------|------|
| `window.__fireflyMusic` | 音乐管理器单例 | MusicManager.astro |
| `window.__fireflyPageLoader` | 页面加载器单例 | page-loader-controller.js |
| `window.__fireflySearchModalController` | 搜索模态框控制器 | search-modal-controller.ts |
| `window.__backToTopInited` | 返回顶部按钮 guard | BackToTop.astro |
| `window.__typewriterHooksBound` | 打字机 Swup 钩子 guard | TypewriterText.astro |
| `window.__fireflySakuraInited` | 樱花特效 guard | SakuraEffect.astro |

### 9.3 禁止的模式

```javascript
// ❌ 每次 Swup 导航都创建新实例
document.addEventListener("DOMContentLoaded", () => {
    new BackToTopManager();  // scroll 监听器累积
});

// ✅ guard 防重复
if (!window.__backToTopInited) {
    window.__backToTopInited = true;
    window.addEventListener("scroll", updateVisibility, { passive: true });
}
```

---

## 10. 控制器模块（Layout.astro 分解产物）

Layout.astro 已从 1492 行分解为 555 行 + 8 个独立控制器模块。**修改页面过渡、滚动、布局逻辑时，必须改对应的控制器，禁止回退到 Layout.astro 内联脚本。**

| 模块 | 文件 | 职责 |
|------|------|------|
| Swup 生命周期 | `swup-lifecycle-controller.ts` | 5 个钩子：link:click, content:replace, visit:start, page:view, visit:end |
| 滚动处理 | `scroll-handler.ts` | back-to-top, TOC 可见性, navbar 自动隐藏 |
| 网格布局 | `grid-layout-utils.ts` | `updateMainGridCols()`, `isCurrentPagePost()` |
| 侧边栏 | `sidebar-utils.ts` | `updateSidebarComponentsVisibility()` |
| Banner | `banner-utils.ts` | `calculateBannerHeightExtend()`, `showBanner()` |
| 面板关闭 | `panel-utils.ts` | `setClickOutsideToClose()`, `initPanelCloseHandlers()` |
| 滚动条 | `scrollbar-utils.ts` | `initCustomScrollbar()` — KaTeX 滚动容器 |
| 标签页标题 | `tab-title-controller.ts` | `initTabTitleInteraction()` — visibilitychange |

**初始化顺序**（Layout.astro DOMContentLoaded 中）：
```
initSwupLifecycle → initScrollHandler → initPanelCloseHandlers → initTabTitleInteraction → initPageLoader
```

---

## 11. Swup 生命周期管理（核心）

### 11.1 钩子职责

| 钩子 | 允许做 | 禁止做 |
|------|--------|--------|
| `link:click` | 添加过渡保护类、隐藏 navbar | 切换布局类、修改网格 |
| `visit:start` | 进度条、移动端 banner 动画、特殊页面重载 | 切换 `lg:is-home` |
| `content:replace` | 切换布局类、更新网格、同步侧栏、重初始化组件、派发事件 | 滚动、启动动画 |
| `page:view` | 滚动到顶部、同步主题、触发评论初始化 | 重复 content:replace |
| `visit:end` | 完成进度条、移除过渡保护 | 修改布局 |

### 11.2 硬性规则

```javascript
// ❌ 禁止：setTimeout 延迟派发
setTimeout(() => window.dispatchEvent(new CustomEvent("swup:content:replaced")), 200);
// ✅ 同步派发（content:replace 时 DOM 已完成替换）
window.dispatchEvent(new CustomEvent("swup:content:replaced"));

// ❌ 禁止：smooth scroll
window.scrollTo({ top: 0, behavior: "smooth" });
// ✅ auto 避免过渡抖动
window.scrollTo({ top: 0, behavior: "auto" });

// ❌ 禁止：location.href 强制重载
window.location.href = visit.to.url;
// ✅ Swup 原生重载
visit.abort();
window.swup.loadPage(visit.to.url, { animate: false });

// ❌ 禁止：裸 new URL() 无保护
const toPath = new URL(visit.to.url, window.location.origin).pathname;
// ✅ try-catch 保护
let toPath;
try { toPath = new URL(visit.to.url, window.location.origin).pathname; }
catch { toPath = visit.to.url || ""; }
```

### 11.3 content:replace 错误边界

```javascript
window.swup.hooks.on("content:replace", () => {
    try { syncHomeLayout(); } catch (e) { console.error("[swup]", e); }
    try { updateMainGridCols(); } catch (e) { console.error("[swup]", e); }
    try { updateSidebarComponentsVisibility(); } catch (e) { console.error("[swup]", e); }
    try { initCustomScrollbar(); } catch (e) { console.error("[swup]", e); }
    window.dispatchEvent(new CustomEvent("swup:content:replaced"));
});
```

### 11.4 新增 Swup 功能的方式

**禁止**在 `swup-lifecycle-controller.ts` 中添加代码。使用事件自注册：

```typescript
// src/utils/my-feature.ts
export function initMyFeature() {
    document.addEventListener("swup:content:replaced", () => {
        // Swup 导航后重新初始化
    });
}
// Layout.astro DOMContentLoaded 中调用一次即可
```

---

## 12. PageLoader 集成规范

### 12.1 行为（当前状态：加载动画已关闭）

- **所有情况**：立即隐藏（`PageLoader.astro` 默认 `hidden` + `page-loader--hidden`，`page-loader-controller.js` 立即派发 `LOADER_HIDDEN_EVENT`）
- **恢复加载动画**：将 `PageLoader.astro` 的 class 改回 `page-loader page-loader--visible`，移除 `hidden` 属性，恢复 `page-loader-controller.js` 中的条件逻辑

### 12.2 关键：LOADER_HIDDEN_EVENT 必须派发

`HomeHero.astro` 在 `await waitForPageLoaderHidden()` 后才启动 GSAP 动画。如果立即隐藏时不派发事件，动画永远不运行，首页内容 `opacity: 0` 不可见。

```javascript
// 立即隐藏时必须派发
if (isMobile(windowRef) || !isHomePath(windowRef.location.pathname)) {
    loader.hidden = true;
    loader.classList.add("page-loader--hidden");
    dispatchDomEvent(documentRef, LOADER_HIDDEN_EVENT, { timestamp: Date.now() });
    return controller;
}
```

### 12.3 禁止

- 在 Layout.astro 中重复注册 PageLoader 的 Swup 钩子
- 在 PageLoader 外部调用 `controller.show()`（由 PageLoader 自己管理生命周期）

---

## 13. 内存泄漏检查清单

每次修改以下组件时必须检查：

| 组件 | 检查项 |
|------|--------|
| SpineModel | `setInterval` 是否在 cleanup 中 `clearInterval`？ |
| Live2DWidget | `resize` 监听器是否先移除再注册？ |
| SakuraEffect | `requestAnimationFrame` 是否在 Swup 导航时停止？ |
| BackToTop | scroll 监听器是否有 `__backToTopInited` guard？ |
| TypewriterText | Swup 钩子是否有 `__typewriterHooksBound` guard？ |
| FancyboxManager | MutationObserver 是否有 5s 超时兜底？动态导入是否有 try-catch？ |
| MusicManager | audio 元素是否用 `data-swup-ignore-script` 防重复？ |

---

## 14. 添加功能的操作清单

### 14.1 添加新页面

1. 创建 `src/pages/myPage.astro`，继承 `MainGridLayout`
2. 可选：`src/styles/pages/myPage.css` + `main.css` 导入
3. 可选：`src/config/navBarConfig.ts` 添加导航链接
4. 可选：`src/i18n/i18nKey.ts` + 5 个语言文件添加翻译

### 14.2 添加新侧栏组件

1. 创建 `src/components/widget/MyWidget.astro`
2. `src/types/config.ts` 的 `WidgetComponentType` 添加类型
3. `src/components/layout/SideBar.astro` 的 `componentMap` 注册
4. `src/config/sidebarConfig.ts` 添加配置

### 14.3 添加新内容集合

1. `src/content.config.ts` 添加 `defineCollection`
2. 创建 `src/content/myCollection/` 目录
3. 在 `export const collections` 中注册

### 14.4 删除功能

1. `grep -rn "ComponentName" src/` 确认无引用
2. 删除组件文件
3. 从 `main.css` 移除样式导入
4. 从 `config/index.ts` 移除配置导出
5. 从 5 个语言文件移除 i18n 键
6. 从 `types/config.ts` 移除类型
7. `pnpm build` 验证

---

## 15. 反模式清单（禁止）

| 反模式 | 后果 |
|--------|------|
| 将 `enableBanner` 设为 `true` | 非首页出现 35vh 空白 |
| 将 `isBannerMode` 设为 `true` | 渲染 wallpaper-wrapper，破坏无 banner 布局 |
| 移除 PageLoader 的 `LOADER_HIDDEN_EVENT` 派发 | HomeHero 动画不运行，首页不可见 |
| `content:replace` 中 `setTimeout` 延迟派发事件 | Svelte 组件重初始化时序不确定 |
| `page:view` 中 `behavior: "smooth"` | 过渡动画期间页面抖动 |
| Swup 容器内用 `client:load` | 每次导航重新挂载 |
| 新建 Stylus 文件 | 已迁移完毕，统一用 CSS |
| 新增 `!important` | 现有 465 处是历史遗留 |
| 组件外新建 CSS 文件 | 必须通过 `main.css` 导入 |
| `main.css` 中 `@import` 位置错误 | 会破坏样式优先级 |
| 删除 `tokens/colors.css` | 主题系统失效 |
| 修改 `backgroundWallpaper.ts` 的 `mode` | 已移除壁纸切换功能 |
| 删除 `swup-lifecycle-controller.ts` | 所有页面过渡逻辑丢失 |

---

## 16. 技术栈版本

| 依赖 | 版本 | 说明 |
|------|------|------|
| Astro | 6.4.x | 不随意升级大版本 |
| Svelte | 5.x | runes API（`$props`, `$state`, `$derived`, `$effect`） |
| Tailwind CSS | 4.x | CSS-first 配置，无 `tailwind.config.js` |
| Swup | @swup/astro | 不迁移到 View Transitions |
| Biome | 2.x | 唯一 linter/formatter |
| pnpm | 9.14.x | 唯一包管理器 |
| Node.js | >= 22 | 运行时要求 |

---

## 17. 已知架构债务（不阻塞开发）

| 问题 | 影响 | 建议 |
|------|------|------|
| `swup-lifecycle-controller.ts` 567 行 | 添加 Swup 功能需改此文件 | 需要时顺手拆分 |
| Waline 代码散布 3 处 | 改配置需改 3 个文件 | 需要时合并 |
| Layout.astro 内联脚本含 moments 评论 | 布局包含功能逻辑 | 需要时提取 |
| `page-loader-controller.js` 是纯 JS | 类型不一致 | 需要时转 TS |
| 465 个 `!important` | 与 Tailwind 冲突的必要覆盖 | 逐步清理 |
| 52 个 `window.*` 全局变量 | 模块间隐式耦合 | 长期目标 |
| PageLoader 加载动画已关闭 | 首页无 loading 过渡 | 恢复方法见第 12 节 |
| HomeHero GSAP 入口动画已跳过 | 首页元素直接显示，无逐个动画 | 恢复需重写 `initHeroOpening()` |

---

## 18. Git 提交规范

```
<type>(<scope>): <description>

type: feat | fix | refactor | style | docs | chore | perf
scope: layout | config | i18n | styles | utils | components | content
```

**每次修改后必须 `pnpm build` 验证通过再提交。**
