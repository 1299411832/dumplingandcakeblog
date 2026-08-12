/* 友链站点截图：Playwright 无头浏览器逐个访问友链站点，压缩为 640 宽 webp
   用法：node scripts/友链截图/index.mjs   （产物提交回仓库由 Action 完成）
   依赖：pnpm add -D playwright（chromium） */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const FRIENDS_DIR = path.join(import.meta.dirname, "../../src/content/friends");
const OUT_DIR = path.join(import.meta.dirname, "../../public/assets/friends-shots");

function readEntries() {
	const entries = [];
	for (const f of fs.readdirSync(FRIENDS_DIR).filter((x) => x.endsWith(".md"))) {
		const raw = fs.readFileSync(path.join(FRIENDS_DIR, f), "utf8");
		const m = raw.match(/^siteurl:\s*(.+)$/m);
		if (m) entries.push({ id: f.replace(/\.md$/, ""), url: m[1].trim().replace(/^["']|["']$/g, "") });
	}
	return entries;
}

const entries = readEntries();
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ok = [];
const failed = [];
for (const entry of entries) {
	const outPath = path.join(OUT_DIR, `${entry.id}.webp`);
	if (fs.existsSync(outPath)) { console.log(`⏭  已有 ${entry.id}.webp`); continue; }
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	try {
		// 注意：不用 networkidle——现代博客有轮询/长连接，永远等不到 idle；
		// "load" 即主要资源加载完，配合一次重试
		await page.goto(entry.url, { waitUntil: "load", timeout: 20000 });
		const buf = await page.screenshot({ type: "png" });
		await sharp(buf).resize({ width: 640 }).webp({ quality: 75 }).toFile(outPath);
		ok.push(entry.id);
		console.log(`✅ ${entry.id}  ${entry.url}`);
	} catch (e) {
		// 一次重试（部分站点首次访问慢）
		try {
			await page.goto(entry.url, { waitUntil: "load", timeout: 25000 });
			const buf = await page.screenshot({ type: "png" });
			await sharp(buf).resize({ width: 640 }).webp({ quality: 75 }).toFile(outPath);
			ok.push(entry.id);
			console.log(`✅(重试) ${entry.id}  ${entry.url}`);
		} catch (e2) {
			failed.push(`${entry.id}（${e2.message.slice(0, 60)}）`);
			console.log(`❌ ${entry.id}  ${entry.url}`);
		}
	} finally {
		await page.close();
	}
}
await browser.close();

console.log(`\n完成：成功 ${ok.length}，失败 ${failed.length}`);
if (failed.length) console.log("失败列表：\n  " + failed.join("\n  "));
