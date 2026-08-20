---
title: AstrBot 使用踩坑记录
published: 2026-08-12
tags:
  - AstrBot
  - Docker
  - NapCat
  - 故障排除
description: 使用 AstrBot + NapCat 部署个人微信/QQ 机器人过程中遇到的各种问题及解决方案，持续更新。
---

> 踩坑不可怕，可怕的是同一个坑踩两遍。记录下来，下次秒查。

---

# 前言

之前写了 [AstrBot + NapCat 部署教程](/posts/技术分享/使用宝塔面板部署AstrBot与NapCat实现QQ机器人)，部署完成后进入插件开发阶段。过程中遇到了一些问题，有些折腾了很久，因此把它们都记下来，方便以后快速定位。

---

# 问题一：发送视频失败——文件存在但容器找不到

## 现象

给机器人发视频链接，视频下载到服务器上了（目录里看得到文件），但机器人发不出来：

```text
ENOENT: no such file or directory, open
'/AstrBot/data/plugin_data/astrbot_plugin_parser/cache/26bb248950ba2bda.mp4'
```

图片发送正常，只有视频出错。

## 原因

AstrBot 和 NapCat 是两个独立的 Docker 容器，运行在同一个 `astrbot-napcat` 网络中。

- AstrBot 容器有挂载 `/root/astrbot_data → /AstrBot/data`
- NapCat 容器没有挂载这个路径

NapCat 发送视频时，需要在**自己的容器里**读取 `file:///AstrBot/data/...` 这个文件，但 NapCat 容器根本看不到这个路径——文件只存在于 AstrBot 容器里，NapCat 容器的文件系统是隔离的。

图片能发是因为图片走了另一条代码路径（不是 file:/// 绝对路径），不依赖容器内路径。

## 解决方案

给 NapCat 容器加一条挂载，指向 AstrBot 的数据目录：

```text
宿主机 /root/astrbot_data → NapCat 容器 /AstrBot/data
```

### 操作步骤

**1. 确认 AstrBot 数据在宿主机的实际路径：**

```bash
docker inspect astrbot --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}'
# 输出示例：/root/astrbot_data -> /AstrBot/data
```

**2. 保存 NapCat 当前状态，然后重建加挂载：**

```bash
# 先查 NapCat 的端口和挂载（重建时需要还原）
docker inspect napcat --format '{{json .HostConfig.PortBindings}}'
docker inspect napcat --format '{{json .Mounts}}'

# 保存当前状态（包括已安装的依赖）
docker commit napcat napcat_backup

# 停止并删除旧容器
docker stop napcat && docker rm napcat

# 重建容器，新增 AstrBot 数据挂载
docker run -d \
  --name napcat \
  --restart unless-stopped \
  --network astrbot-napcat \
  -p 3000:3000 -p 3001:3001 -p 6099:6099 \
  -v <原配置目录1>:/app/napcat/config \
  -v <原配置目录2>:/app/.config/QQ \
  -v /root/astrbot_data:/AstrBot/data \
  napcat_backup
```

> ⚠️ 不能直接用宝塔面板「编辑容器 → 添加挂载」——面板重建容器时不会继承原容器的 entrypoint/cmd，会报 `no command specified` 错误。必须用 `docker commit` + `docker run` 方式。

**3. 验证：**

```bash
# 确认 NapCat 能看到 AstrBot 的文件
docker exec napcat ls /AstrBot/data/plugin_data/astrbot_plugin_parser/cache/
```

看到文件列表就说明路径通了，再发一次视频测试。

## 根本原理

Docker 容器的文件系统是隔离的。容器 A 里下载的文件，容器 B 默认看不到。只有把同一块宿主机目录挂载到两个容器，才能共享文件。视频发送走的是 `file:///` 路径读取，NapCat 必须能在自己的容器里找到这个文件。

---

# （后续问题持续更新中……）

---

# 附：问题速查索引

| 问题 | 关键词 | 解决思路 |
|---|---|---|
| 视频发送失败：文件不存在 | `ENOENT`、`file:///AstrBot/data`、容器挂载 | NapCat 容器加 AstrBot 数据挂载 |
