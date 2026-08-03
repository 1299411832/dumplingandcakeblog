#!/usr/bin/env node
/**
 * EdgeOne 构建前置脚本
 * 去掉 API 路由中的 export const prerender = false;
 * 因为 EdgeOne 用纯静态构建，不需要 server-rendered 页面
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, "../src/pages/api/admin");
const BACKUP_DIR = path.resolve(__dirname, "../src/api-backup/admin");

// 确保备份目录存在
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const files = fs.readdirSync(API_DIR).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const filePath = path.join(API_DIR, file);
  let content = fs.readFileSync(filePath, "utf-8");

  // 备份原始内容
  fs.writeFileSync(path.join(BACKUP_DIR, file), content, "utf-8");

  // 删除 prerender = false 行
  if (content.includes("export const prerender = false;")) {
    content = content.replace(/export const prerender = false;\n?/g, "");
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`  stripped prerender: ${file}`);
  }
}

console.log("pre-build: ready for static EdgeOne build");
