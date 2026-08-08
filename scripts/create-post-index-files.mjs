// 一次性脚本：为 posts 每个一级分类文件夹创建 index.md（Decap nested 文件夹代表）
// index 文件 title = 文件夹名，draft: true（主题所有查询过滤 draft，不会发布）
// Decap 配置 meta.path.index_file: index 后，文件夹显示名 = index 文件的 title
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const postsDir = join(process.cwd(), "src/content/posts");

for (const dir of readdirSync(postsDir)) {
	const full = join(postsDir, dir);
	const indexFile = join(full, "index.md");
	// 跳过非目录（如顶层 md）和图片目录
	if (!existsSync(full) || !statSync(full).isDirectory()) continue;
	if (dir === "images") continue;
	if (existsSync(indexFile)) {
		console.log(`  ⚠ 已存在: ${dir}/index.md`);
		continue;
	}
	const content = `---
title: ${dir}
published: 2026-01-01
draft: true
description: ${dir} 分类索引页
path: "${dir}/index"
---
`;
	writeFileSync(indexFile, content, "utf8");
	console.log(`  ✓ 创建: ${dir}/index.md`);
}

console.log("完成");
