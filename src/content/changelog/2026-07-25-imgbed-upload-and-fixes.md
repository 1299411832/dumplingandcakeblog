---
version: "v1.18.0"
date: 2026-07-25
time: "20:00"
type: feature
description: 说说/足迹后台图片自动上传到图床、图片查重复用、同步脚本去重修复、时间时区修复、足迹后台优化
---

## 后台图片自动上传到图床

- 说说后台（`/admin/moments/`）新增 📤 上传图片按钮，支持选择文件直接上传到 CloudFlare ImgBed
- 足迹后台（`/admin/places/`）同样新增上传功能
- 支持多文件批量选择，实时显示上传进度
- 上传时保留原始文件名（`uploadNameType=origin`）
- 图片存入可配置的目录（`PUBLIC_IMAGEBED_FOLDER`）

## 图片查重机制

- 上传前通过 `/api/manage/list` 接口搜索图床是否已有同名文件
- 已存在的图片直接复用 URL，不重复上传
- 状态栏显示"上传 X 张，复用 Y 张"
- 需配置 `PUBLIC_IMAGEBED_API_TOKEN`（需 `list` 权限）

## 同步脚本去重修复

- 修复说说同步脚本（`backup-gist`）同一天发布多条说说时，后续条目被误跳过并从 Gist 删除的问题
- 修复足迹同步脚本同一天同一城市多个足迹被误跳过的问题
- 去重逻辑从日期（`published` / `date+city`）改为唯一标识（`id`）
- `id` 字段写入 frontmatter 用于后续去重

## 说说自定义时间修复

- 修复自定义时间因 `toISOString()` 转 UTC 导致的 8 小时偏移（14:21 → 06:21）
- 修复 `datetime-local` 输入值缺少秒数导致 Astro 构建报错
- 时间格式统一为 `YYYY-MM-DD HH:mm:ss`（本地时间）

## 足迹后台优化

- 经纬度输入区域添加高德地图坐标拾取器链接（`lbs.amap.com/tools/picker`）
- 获取坐标时，若填写了详细地址则自动覆盖城市字段，预览更精确
