---
version: "v1.17.1"
date: 2026-07-23
time: "16:30"
type: improvement
description: 敏感信息迁移到环境变量、跑马灯优化、首页背景图优化、图片压缩
---

## 敏感信息迁移到环境变量

- 所有硬编码的 Key/Token/密码迁移到 `.env` 文件管理
- 支持的环境变量：高德地图 Key、Umami 统计、Waline 评论、后台密码哈希
- `.env` 已加入 `.gitignore`，不会上传到 GitHub
- 创建 `.env.example` 模板文件
- 部署平台（Vercel/EdgeOne/GitHub Pages）设置对应环境变量即可

## 跑马灯优化

- DOM 数量从 4 份减少到 3 份，降低内存占用
- 移除 JS 动态计算宽度逻辑，改为纯 CSS 动画控制
- 删除 `initHomeTicker()` 函数
- 滚动速度提升一倍（30s → 15s）

## 首页背景图优化

- 移动端背景图切换不再闪烁（预加载后无缝切换）
- 移除初始 `opacity: 0`，避免灰色闪烁
- 桌面端背景图改为客户端随机化，部署后也能正常随机

## 图片压缩

- 新增 `pnpm compress-images` 批量压缩脚本
- 支持压缩 `sjtapi`、`mobile-bg`、`home` 三个目录
- 压缩率约 78%（64MB → 14MB）
- 支持 `--dry-run` 预览、`--quality` 自定义质量、`--dir` 指定目录

## 说说页面图片下载

- 同步 Gist 说说数据时自动下载图片到本地
- 下载目录：`F:\电脑备份文件夹\CloudFlare-ImgBed\telegram\手机uu`
- 已存在的图片自动跳过

## 其他改进

- 个人资料小组件背景图改为静态图片
- 恋爱小组件标题显示总天数
- 关闭桌面端主页雨滴特效
- 移动端加载动画硬超时缩短到 800ms
