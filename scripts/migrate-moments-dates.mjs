// 一次性迁移脚本：将 moments 的 published 纯日期（YYYY-MM-DD）补齐为 YYYY-MM-DD 00:00:00
// 原因：PagesCMS date 字段用严格格式解析（yyyy-MM-dd HH:mm:ss），纯日期解析失败显示空白
// 补齐后格式统一、无损（Astro z.date 宽容解析两种格式）
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/content/moments");
let changed = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
	const path = join(dir, file);
	const raw = readFileSync(path, "utf8");
	const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!fmMatch) continue;
	const fm = fmMatch[1];
	const newFm = fm.replace(
		/^published: (\d{4}-\d{2}-\d{2})$/m,
		"published: $1 00:00:00",
	);
	if (newFm !== fm) {
		writeFileSync(path, raw.replace(fm, newFm), "utf8");
		console.log(`✓ ${file}: 补齐时间`);
		changed++;
	}
}

console.log(changed ? `完成，共补齐 ${changed} 篇` : "无需要处理的文件");
