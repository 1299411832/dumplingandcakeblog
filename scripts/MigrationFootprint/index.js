#!/usr/bin/env node

/**
 * 足迹 Gist → 本地 Markdown 迁移脚本
 *
 * 功能：
 *   1. 从 GitHub Gist 读取足迹数据
 *   2. 转换为本地 Markdown 文件（YAML frontmatter 格式）
 *   3. 写入 src/content/life/places/ 目录
 *   4. 迁移完成后可选择清空 Gist
 *
 * 用法：
 *   node scripts/MigrationFootprint/index.js                           # 迁移全部，清空 Gist
 *   node scripts/MigrationFootprint/index.js --dry-run                 # 仅预览
 *   node scripts/MigrationFootprint/index.js --keep-gist               # 迁移后保留 Gist 数据
 *   node scripts/MigrationFootprint/index.js --token=ghp_xxx           # 指定 GitHub Token
 *   GITHUB_TOKEN=ghp_xxx node scripts/MigrationFootprint/index.js      # 通过环境变量传入 Token
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

// ═══════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════

const GIST_ID = "3664c0266410b5a28c496733c1ee2c98";
const FILE_NAME = "places";
const TARGET_DIR = path.join(ROOT, "src", "content", "life", "places");

const DRY_RUN = process.argv.includes("--dry-run");
const KEEP_GIST = process.argv.includes("--keep-gist");
const TOKEN_ARG = process.argv.find((a) => a.startsWith("--token="));

// ═══════════════════════════════════════════════════
// Token 加载
// ═══════════════════════════════════════════════════

function loadGithubToken() {
  // 1. 命令行参数 --token=ghp_xxx
  if (TOKEN_ARG) {
    const t = TOKEN_ARG.split("=")[1];
    if (t) return t;
  }
  // 2. 环境变量
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  // 3. .env 文件
  try {
    const envPath = path.join(ROOT, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/GITHUB_TOKEN\s*=\s*(.+)/);
      if (match && match[1].trim()) return match[1].trim();
    }
  } catch {}
  // 4. externalPlacesConfig.ts（仅当值非空时）
  try {
    const configPath = path.join(ROOT, "src", "config", "externalPlacesConfig.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content.match(/githubToken:\s*"([^"]+)"/);
    if (match && match[1]) return match[1];
  } catch {}
  return "";
}

const GITHUB_TOKEN = loadGithubToken();

// ═══════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════

function yamlEscape(value) {
  // 如果字符串包含特殊字符，用引号包裹
  const str = String(value);
  if (/[:#\n"'{}[\],&*?|>!%`@]/.test(str) || str.includes("\\")) {
    return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return str;
}

function writeMarkdownFile(date, frontmatter) {
  const filename = date + ".md";
  let filepath = path.join(TARGET_DIR, filename);

  // 同名日期去重
  let i = 2;
  while (fs.existsSync(filepath)) {
    filepath = path.join(TARGET_DIR, date + "-" + i + ".md");
    i++;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] 将写入: ${path.relative(ROOT, filepath)}`);
    return true;
  }

  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        // 数组元素统一加引号，避免纯数字（如 "2025"）被 YAML 解析为 number
        const str = String(item);
        lines.push(`  - "${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
      }
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      // date 字段不加引号
      if (key === "date") {
        lines.push(`${key}: ${value}`);
      } else {
        lines.push(`${key}: ${yamlEscape(value)}`);
      }
    }
  }
  lines.push("---");
  lines.push(""); // 空行

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, lines.join("\n"), "utf-8");
  return true;
}

// 从 Gist Raw URL 读取（无需认证）
async function fetchGistRaw(gistId) {
  const url = `https://gist.githubusercontent.com/raw/${gistId}?t=${Date.now()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  return JSON.parse(text);
}

// 更新 Gist（清空数据）
async function updateGist(gistId, fileName, data) {
  if (DRY_RUN) {
    console.log(`  [dry-run] 将更新 Gist ${gistId.slice(0, 8)}... (剩余 ${data.length} 条)`);
    return true;
  }
  if (!GITHUB_TOKEN) {
    console.log("  ⚠ 未设置 GITHUB_TOKEN，无法清空 Gist");
    console.log("    请通过以下方式之一传入 Token:");
    console.log("      --token=ghp_xxx");
    console.log("      GITHUB_TOKEN=ghp_xxx node scripts/MigrationFootprint/index.js");
    console.log("    或手动在 Gist 页面清理数据");
    return false;
  }
  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        [fileName]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });
  if (!resp.ok) {
    console.log(`  ⚠ Gist 更新失败: HTTP ${resp.status}`);
    const body = await resp.text();
    console.log(`  ${body.slice(0, 200)}`);
    return false;
  }
  return true;
}

// 读取本地已有文件的日期，用于去重
function readExistingDates(dir) {
  const dates = new Map();
  if (!fs.existsSync(dir)) return dates;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;
      const dateMatch = match[1].match(/^date:\s*(.+)$/m);
      if (dateMatch) {
        const d = dateMatch[1].trim().replace(/^["']|["']$/g, "");
        dates.set(d, file);
      }
    } catch {}
  }
  return dates;
}

// ═══════════════════════════════════════════════════
// 迁移逻辑
// ═══════════════════════════════════════════════════

async function migrate() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   足迹 Gist → 本地 Markdown 迁移    ║");
  console.log("╚══════════════════════════════════════╝\n");

  console.log(`Gist ID: ${GIST_ID}`);
  console.log(`目标目录: ${path.relative(ROOT, TARGET_DIR)}`);
  if (DRY_RUN) console.log("模式: DRY-RUN（仅预览）");
  if (KEEP_GIST) console.log("模式: 迁移后保留 Gist 数据");
  console.log("");

  // 1. 获取 Gist 数据
  let entries;
  try {
    console.log("正在读取 Gist 数据...");
    entries = await fetchGistRaw(GIST_ID);
  } catch (e) {
    console.error(`✗ 读取 Gist 失败: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    console.log("Gist 中没有足迹数据，无需迁移");
    return;
  }

  console.log(`Gist 中共有 ${entries.length} 条足迹数据\n`);

  // 2. 读取本地已有日期
  const existingDates = readExistingDates(TARGET_DIR);
  if (existingDates.size > 0) {
    console.log(`本地已有 ${existingDates.size} 个文件，将跳过同日期数据\n`);
  }

  // 3. 逐条迁移
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const remaining = [];

  for (const entry of entries) {
    const date = entry.date || "";
    if (!date) {
      console.log(`⚠ 跳过无日期条目: ${entry.province || ""} ${entry.city || ""}`);
      remaining.push(entry); // 无日期条目始终保留在 Gist
      skipped++;
      continue;
    }

    // 按日期 + 省份 + 城市去重
    if (existingDates.has(date)) {
      const existingFile = existingDates.get(date);
      try {
        const content = fs.readFileSync(path.join(TARGET_DIR, existingFile), "utf-8");
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const pMatch = match[1].match(/^province:\s*(.+)$/m);
          const cMatch = match[1].match(/^city:\s*(.+)$/m);
          const existingProvince = (pMatch ? pMatch[1].trim().replace(/^["']|["']$/g, "") : "");
          const existingCity = (cMatch ? cMatch[1].trim().replace(/^["']|["']$/g, "") : "");
          if (existingProvince === (entry.province || "") && existingCity === (entry.city || "")) {
            console.log(`↷ 跳过重复: ${date}  ${existingProvince} · ${existingCity}`);
            remaining.push(entry); // 重复条目始终保留在 Gist
            skipped++;
            continue;
          }
        }
      } catch {}
    }

    // 构建 frontmatter
    const fm = {
      date: date,
      province: entry.province || "",
      city: entry.city || "",
      experience: entry.experience || "",
      visitCount: entry.visitCount || 1,
      lat: entry.lat || "",
      lng: entry.lng || "",
    };

    if (entry.url) fm.url = entry.url;
    if (entry.urlLabel) fm.urlLabel = entry.urlLabel;
    if (entry.photos && entry.photos.length > 0) fm.photos = entry.photos;
    if (entry.tags && entry.tags.length > 0) fm.tags = entry.tags;

    const success = writeMarkdownFile(date, fm);
    if (success) {
      migrated++;
      const name = [entry.province, entry.city].filter(Boolean).join(" · ") || "未命名";
      console.log(`✓ ${date}  ${name}`);
    } else {
      failed++;
      remaining.push(entry); // 写入失败的条目始终保留在 Gist
    }
  }

  // 4. 更新 Gist
  if (!KEEP_GIST) {
    const removeCount = entries.length - remaining.length;
    if (removeCount > 0) {
      console.log(`\n正在清空 Gist 中已迁移的 ${removeCount} 条数据...`);
      await updateGist(GIST_ID, FILE_NAME, remaining);
    }
  }

  // 5. 汇总
  console.log(`\n════════════════════════════════════════`);
  console.log(`迁移完成`);
  console.log(`  迁移成功: ${migrated} 条`);
  console.log(`  跳过重复: ${skipped} 条`);
  if (failed > 0) console.log(`  失败: ${failed} 条`);
  if (!KEEP_GIST) console.log(`  Gist 剩余: ${remaining.length} 条`);
  if (DRY_RUN) console.log("  (DRY-RUN 模式，未实际写入)");
  console.log("════════════════════════════════════════\n");
}

migrate().catch((e) => {
  console.error("迁移失败:", e);
  process.exit(1);
});