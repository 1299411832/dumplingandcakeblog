# AGENTS.md

**回复语言：必须全程使用中文回答用户，禁止使用英文**（用户看不懂英文）。

**先读 CLAUDE.md**：本仓库唯一权威工程规范（20 节：命令、目录结构、样式/组件规范、i18n、Swup 生命周期、反模式清单、技术栈版本、PagesCMS 后台）。所有开发行为必须遵守。修改项目后必须同步更新 CLAUDE.md（第 20 节）。

**勿把 CLAUDE.md 内容复制进本文件**（CLAUDE.md §17 规定 AGENTS.md 只是入口，避免双重维护）。本文件仅保留最高频的启动事实，细节一律以 CLAUDE.md 为准。

## 项目概览

- Firefly v6.6.13 —— "团子和蛋糕的博客"，Fork 自 CuteLeaf/Firefly 并深度定制
- 部署 EdgeOne Pages（push main 自动构建）；后台 PagesCMS 自托管（cms.tsh520.cn，配置在根目录 `.pages.yml`，字段必须与 `src/content.config.ts` 的 zod 对齐，未声明字段保存时被丢弃）
- 13 个 Astro Content Collections（`src/content.config.ts` + `src/content/`）
- **本地 Obsidian 插件**（`plug-in/Obsidian/obsidian-category-autofill/`，独立 git 仓库，已 gitignore）：自动维护文章的 category 与新建文章属性。**改它的规范见该目录的 AGENTS.md**——完成改动后必须 `pnpm build`（自动拷贝进 `src` 库）+ `pnpm test` + commit & push GitHub + 提醒用户 reload Obsidian

## 快速上手

- 包管理器仅限 pnpm 9.14（preinstall 强制）；Node >= 22；**无测试框架**
- `pnpm dev` 开发；提交前必跑 `pnpm build`（生成图标 → astro build → pagefind 索引）
- 提交信息格式 `<type>(<scope>): <描述>`（feat|fix|refactor|style|docs|chore|perf，见 CLAUDE.md §18）
- 验证手段 = `pnpm build` + `pnpm check`（astro check）
- `pnpm lint` / `pnpm format` = Biome（唯一 linter/formatter，作用域 ./src）

## 最易踩坑（详见 CLAUDE.md §15）

- Astro 7 + Svelte 5 + Tailwind v4：无 tailwind.config.js，勿按 Astro 6 / Tailwind 3 文档操作
- 样式必须经 `src/styles/main.css` 导入；禁止新建 `!important`、硬编码 `#000/#fff`、Stylus 文件；暗色选择器统一 `:root.dark`
- Svelte 5 runes：响应式变量（含 DOM ref）必须 `$state`；非 void 标签禁止自闭合
- Swup SPA 导航：容器内组件避免 `client:load`；监听器用 AbortController 清理；跨导航单例用 `window.__xxx` guard（§8-9）
- 新 i18n 键必须同时加进全部 5 个语言文件（§7）
- 新增 Swup 功能禁止改 `swup-lifecycle-controller.ts`，用 `swup:content:replaced` 事件自注册（§11.4）
- 禁止用 Python 脚本操作/修改文件，一律用 Node 脚本（§15）
