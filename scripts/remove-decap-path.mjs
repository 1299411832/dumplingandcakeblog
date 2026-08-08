// 一次性清理脚本：删除 posts / notebooks 文章 frontmatter 里的 path 字段
// 背景：path 字段是 Decap nested 方案（已弃用）遗留，普通集合方案不需要，
//       保留无害但污染文件。删除后内容更干净。
// 用法：node scripts/remove-decap-path.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
	"src/content/posts",
	"src/content/life/notebooks",
];

function collectMd(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) collectMd(p, out);
		else if (name.endsWith(".md")) out.push(p);
	}
	return out;
}

let removed = 0;
for (const target of TARGETS) {
	for (const p of collectMd(target)) {
		const raw = readFileSync(p, "utf8");
		const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		if (!fmMatch) continue;
		const fm = fmMatch[1];
		if (!fm.match(/^path:/m)) continue;
		const newFm = fm.replace(/^path:.*\n?/m, "");
		writeFileSync(p, raw.replace(fm, newFm), "utf8");
		console.log(`  ✓ 移除: ${p.replace(process.cwd() + "\\", "")}`);
		removed++;
	}
}
console.log(`完成：清理 ${removed} 个文件`);
