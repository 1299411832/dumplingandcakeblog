---
version: "v1.16.0"
date: 2026-07-15
time: "23:00"
type: improvement
description: 分类页面卡片统一、音乐页面优化、移动端播放器布局改进
---

## 分类页面重构

- 分类页面文章卡片从 `PostCard.astro` 替换为 `ArticleVirtualList.svelte`，与文章列表页保持一致
- 支持 list/grid 模式切换（骷髅开关）
- 支持封面图隐藏开关（`data-hide-covers`）
- 标签区域改为折叠展开，默认显示前 8 个高频标签
- 面包屑导航与标签筛选合并为一个卡片，减少多余间距

## 移动端文章页修复

- 修复移动端文章阅读页面顶部 ~88px 空白区域
- 提升 `mobile-dock.css` 中 `.no-banner-layout` 选择器特异性，覆盖 `layout-styles.css` 的 `top: 5.5rem` 规则

## 音乐页面优化

- 移除音乐页面主题切换逻辑（进入时强制暗色、离开时恢复），提升页面加载速度
- 移除 `<html>` 上的 `is-navigating-to-music` 和 `dark` 类的 SSR 注入
- 移除 Capture 阶段点击音乐链接时的暗色模式切换
- 移除 Swup `content:replace` 中离开音乐页时的主题恢复逻辑
- 音乐播放器添加返回首页按钮（`home-outline-rounded` 图标，位于下一首按钮右侧）

## 移动端播放器布局

- 音乐播放器控制区从横向三列改为上下三层布局
- 第 1 行：歌曲信息（封面 + 名称 + 歌手）
- 第 2 行：进度条
- 第 3 行：控制按钮（居中显示，包含音量按钮）
- 移动端音量按钮不再隐藏

## Swup 过渡修复

- 修复从分类页面导航到文章列表页面后布局错乱的问题
- Swup `content:replace` 后派发 `swup:content:replaced` 事件
- `ArticleVirtualList` 监听事件重新初始化 grid 列数和移动端检测
