// 一次性迁移脚本：将 moments frontmatter 中 images 标量（逗号串或单 URL）转为数组格式
// 前置：接入 PagesCMS 前执行，避免 CMS 保存时标量 images 被丢弃
// 主题 parseImages 双兼容（字符串按 [,;] 分割 / 数组直接映射），迁移安全
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
	// 仅匹配同行有值的标量形式；多行数组（images: 后无值）不匹配
	const lineMatch = fm.match(/^images:[ \t]*(.+?)[ \t]*$/m);
	if (!lineMatch) continue;
	const value = lineMatch[1].trim();
	// 空值 / YAML 内联数组（images: [a, b]）跳过
	if (!value || value.startsWith("[")) continue;
	const urls = value
		.split(/[,;]/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (!urls.length) continue;

	const newFm = fm.replace(
		/^images:[ \t]*(.+?)[ \t]*$/m,
		"images:\n" + urls.map((u) => `  - ${u}`).join("\n"),
	);
	writeFileSync(path, raw.replace(fm, newFm), "utf8");
	console.log(`✓ ${file}: ${urls.length} 张`);
	changed++;
}

console.log(changed ? `完成，共迁移 ${changed} 个文件` : "无需要迁移的文件");
