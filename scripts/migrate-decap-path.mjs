// 一次性迁移脚本：给 posts / notebooks 的 md 文件 frontmatter 添加 path 字段
// 目的：Decap CMS 的 nested collections 需要每篇文章带 path（相对集合目录的路径），
//       用于树形文件夹展示与定位。path 字段会被 Astro zod 忽略（无害），不影响构建。
// 用法：node scripts/migrate-decap-path.mjs
// 回退：git checkout -- src/content/ 即可还原
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 需要 nested 处理的集合目录
const TARGETS = [
	{ folder: "src/content/posts", collection: "posts" },
	{ folder: "src/content/life/notebooks", collection: "notebooks" },
];

/** 递归收集目录下所有 .md 文件 */
function collectMd(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			collectMd(p, out);
		} else if (name.endsWith(".md")) {
			out.push(p);
		}
	}
	return out;
}

let changed = 0;
let skipped = 0;

for (const t of TARGETS) {
	console.log(`\n=== ${t.collection} (${t.folder}) ===`);
	const files = collectMd(t.folder);
	for (const p of files) {
		const raw = readFileSync(p, "utf8");
		const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		if (!fmMatch) {
			console.log(`  ⚠ 无 frontmatter，跳过: ${p}`);
			continue;
		}
		const fm = fmMatch[1];
		if (fm.match(/^path:/m)) {
			skipped++;
			continue; // 已有 path，跳过
		}
		// 相对集合目录的路径（不含扩展名），统一 / 分隔
		const rel = relative(t.folder, p)
			.replace(/\\/g, "/")
			.replace(/\.md$/, "");
		// 追加到 frontmatter 末尾（YAML 键顺序无关，path 会被 Astro strip）
		const newFm = fm.replace(/\s*$/, "") + `\npath: ${JSON.stringify(rel)}\n`;
		writeFileSync(p, raw.replace(fm, newFm), "utf8");
		console.log(`  ✓ ${rel}`);
		changed++;
	}
}

console.log(`\n完成：新增 ${changed} 个，已有跳过 ${skipped} 个`);
