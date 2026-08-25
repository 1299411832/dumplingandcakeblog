---
version: "v1.27.0"
date: 2026-09-27
type: feature
description: 笔记本归档改版为动态式卡片流，支持多图与折叠收起
---

## 笔记本归档卡片流重做

- **归档页重做**：`src/pages/life/notebooks/[...slug].astro` 日历下方的 `archive-panel` 时间线替换为卡片流 `nb-archive-feed`，每张卡 `nb-archive-card` 含头像/标题/日期 + 正文 + 图片网格 + 标签/评论按钮；旧 `ap-*` 时间线样式与详情页分支（`isNotebookIndex:false`）已删除
- **卡片视觉**：参考 `src/pages/life/notebooks/index.astro` 的 `nb-note-card`（`src/styles/pages/notebooks.css:440` `1px var(--line-divider) / 0.875rem 圆角 / var(--card-bg) / hover 边框变 primary+上浮阴影`），不复刻 `MomentCard` 的 `2px #000 + accent-bar`
- **文字折叠**：正文 `.nb-archive-content` 默认 `-webkit-line-clamp:3`，按钮 `.nb-archive-expand-btn` 切换 `.is-expanded` 显示全部；客户端 `scrollHeight > clientHeight` 时才显示按钮，短文本自动隐藏
- **图片网格**：对齐 `src/components/moments/MomentCard.astro:79` 的 `getGridCols` 规则（1→1列 2/4→2列 其余→3列）+ `gridMax=9` + `hidden-image` + `+N` 遮罩 + `data-fancybox="gallery-{folder}-{slug}"` 灯箱；样式段 `src/styles/pages/notebooks.css:586` 的 `.nb-archive-images/.nb-image-item/.more-overlay`
- **多图字段**：`src/content.config.ts:147` 新增 `images` 主字段（`string|string[]`，兼容逗号/分号/换行分隔），保留旧 `image` 别名；`src/pages/life/notebooks/[...slug].astro:93` 归一 `normalizeImages`；`.pages.yml:505` 的 `life-notebooks-index/entries` 同步新增 `images` (`imgbed` list) 与旧 `image` 保留
- **路由精简**：`getStaticPaths` 仅生成归档页 `params.slug=folderName`，不再为每篇笔记生成详情页；旧详情 URL 将 404
- **首页跳转**：`src/pages/life/notebooks/index.astro:174` 的 `recentNotes.href` 由 `/{id}/` 改为 `/{folder}/#note-{slug}`，点击跳归档并锚点定位；归档脚本 `handleHashScroll` 偏移 88px + 高亮 `is-hash-target`
- **锚点与评论联动**：卡片 `id="note-{slug}"` + `data-nb-href="/{folder}/#note-{slug}"`，评论按钮派发 `notebook-comment-quote` 并滚动到 `#comments`；Swup `content:replaced`/`page-load` 重绑 + `resize` 重检溢出
- **验证**：`pnpm check` 0 errors / `pnpm build` 365 pages / `pnpm exec biome ci ./src --reporter=github` 仅剩既有 `bill-adapter:279` 的 `noNonNullAssertion` 警告
