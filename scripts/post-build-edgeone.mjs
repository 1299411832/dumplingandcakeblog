#!/usr/bin/env node
/**
 * EdgeOne 构建后置脚本
 * 恢复 API 路由中的 export const prerender = false;
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, "../src/pages/api/admin");
const BACKUP_DIR = path.resolve(__dirname, "../src/api-backup/admin");

if (!fs.existsSync(BACKUP_DIR)) {
  process.exit(0);
}

const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const src = path.join(BACKUP_DIR, file);
  const dest = path.join(API_DIR, file);
  fs.copyFileSync(src, dest);
  console.log(`  restored prerender: ${file}`);
}

console.log("post-build: restored API route prerender flags");
