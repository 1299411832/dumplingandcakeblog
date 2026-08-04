/**
 * 构建时生成数据索引
 *
 * 读取 src/content/ 下的所有 content collection 的 .md 文件，
 * 解析 frontmatter + body，生成 public/data/*.json 静态文件。
 *
 * 后台页面通过这些 JSON 读取已发布数据（走 EdgeOne CDN，秒开、免 token、不耗 GitHub API 额度）。
 * 写操作仍由后台页面通过 GitHub API 直连。
 *
 * 用法：node scripts/generate-data-index.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import * as yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "src/content");
const OUT_DIR = path.join(ROOT, "public/data");

// 用 CORE_SCHEMA 解析 YAML，禁用 timestamp 自动转换，保留日期字符串原样（避免时区偏移）
function parseYaml(str) {
  return yaml.load(str, { schema: yaml.CORE_SCHEMA });
}

/**
 * 规范日期值：统一为字符串，避免 gray-matter 转成 Date 对象后在 JSON 里变成时间戳
 */
function normalizeFrontmatter(fm) {
  const result = {};
  for (const [key, value] of Object.entries(fm)) {
    if (value instanceof Date) {
      result[key] = formatDate(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) => (v instanceof Date ? formatDate(v) : v));
    } else if (typeof value === "object" && value !== null) {
      result[key] = JSON.parse(JSON.stringify(value));
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  // 时间是 00:00:00 时只返回日期，否则返回完整时间
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
    ? dateStr
    : `${dateStr} ${timeStr}`;
}

/**
 * 递归读取目录下所有 .md/.mdx 文件
 */
function walkDir(dir, base, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, base, result);
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      const relPath = path.relative(base, fullPath).split(path.sep).join("/");
      result.push({ fullPath, relPath });
    }
  }
  return result;
}

/**
 * 生成单个集合的 JSON
 * @param {string} collection 集合名（对应 src/content/ 下的目录）
 * @param {object} opts { recursive: 是否递归子目录, skipDirs: 跳过的子目录 }
 */
function generateCollection(collection, opts = {}) {
  const { recursive = true, skipDirs = [] } = opts;
  const dir = path.join(CONTENT_DIR, collection);
  if (!fs.existsSync(dir)) {
    console.log(`  ⚠ 集合不存在: ${collection}`);
    return;
  }

  let files;
  if (recursive) {
    files = walkDir(dir, dir);
  } else {
    // 只读一层（跳过子目录和 assets）
    files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(md|mdx)$/.test(e.name))
      .map((e) => ({ fullPath: path.join(dir, e.name), relPath: e.name }));
  }

  // 过滤跳过目录
  files = files.filter((f) => {
    const topDir = f.relPath.split("/")[0];
    return !skipDirs.includes(topDir);
  });

  const entries = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f.fullPath, "utf-8");
      const parsed = matter(raw, { engines: { yaml: parseYaml } });
      const fm = normalizeFrontmatter(parsed.data);
      entries.push({
        path: `src/content/${collection}/${f.relPath}`.split("/").join("/"),
        frontmatter: fm,
        body: parsed.content.trim(),
      });
    } catch (e) {
      console.log(`  ⚠ 解析失败 ${f.relPath}: ${e.message}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // 展平输出文件名：life/places → places.json
  const outName = collection.split("/").pop();
  fs.writeFileSync(
    path.join(OUT_DIR, `${outName}.json`),
    JSON.stringify(entries),
    "utf-8",
  );
  console.log(`  ✓ ${outName}.json (${entries.length} 条)`);
}

// ─── 主流程 ─────────────────────────────────────

console.log("📦 生成数据索引 → public/data/");
fs.mkdirSync(OUT_DIR, { recursive: true });

// 说说
generateCollection("moments");

// 文章（跳过图片目录）
generateCollection("posts", { skipDirs: ["images", "assets"] });

// 友链
generateCollection("friends");

// 影视（含子目录）
generateCollection("bangumi");

// 足迹
generateCollection("life/places", { recursive: false });

// 笔记（含子目录）
generateCollection("life/notebooks");

console.log("✅ 数据索引生成完成");
