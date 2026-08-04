/**
 * 上传说说图片到图床并重写源文件
 *
 * 处理 src/content/moments/2025-10-06.md 的 images 字段
 * （把本地相对路径 assets/default (N).jpeg 上传到图床，换成完整 URL 数组）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 加载 .env
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const IMGBED_URL = (process.env.PUBLIC_IMAGEBED_URL || "").replace(/\/+$/, "");
const AUTH_CODE = process.env.PUBLIC_IMAGEBED_AUTH_CODE || "";
const FOLDER = process.env.PUBLIC_IMAGEBED_FOLDER || "手机uu";

const TARGET = path.join(ROOT, "src/content/moments/2025-10-06.md");
const ASSETS_DIR = path.join(ROOT, "src/content/moments/assets");

async function uploadImage(filePath, filename) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)], { type: "image/jpeg" }), filename);
  const params = ["returnFormat=full", "uploadNameType=origin"];
  if (AUTH_CODE) params.push("authCode=" + encodeURIComponent(AUTH_CODE));
  if (FOLDER) params.push("uploadFolder=" + encodeURIComponent(FOLDER));
  const url = `${IMGBED_URL}/upload?${params.join("&")}`;
  const resp = await fetch(url, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const result = Array.isArray(data) ? data[0] : data;
  const u = result?.publicUrl || result?.src || result?.url || "";
  if (!u) throw new Error(`图床未返回 URL: ${JSON.stringify(data).slice(0, 100)}`);
  return u;
}

async function main() {
  if (!IMGBED_URL || !AUTH_CODE) {
    console.error("缺少图床配置，请检查 .env 的 PUBLIC_IMAGEBED_URL / AUTH_CODE");
    process.exit(1);
  }

  // 读取目标文件当前内容
  const raw = fs.readFileSync(TARGET, "utf-8");
  console.log("目标文件:", TARGET);

  // 找出 assets 下的 default 图片
  const files = [];
  for (let i = 1; i <= 12; i++) {
    const fp = path.join(ASSETS_DIR, `default (${i}).jpeg`);
    if (fs.existsSync(fp)) files.push(fp);
  }
  console.log(`找到 ${files.length} 张本地图片，开始上传到图床 ${FOLDER}/ ...`);

  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    const fn = path.basename(fp);
    try {
      const url = await uploadImage(fp, fn);
      urls.push(url);
      console.log(`  ✓ ${fn} → ${url}`);
    } catch (e) {
      console.log(`  ✗ ${fn} 上传失败: ${e.message}`);
    }
  }

  if (!urls.length) {
    console.error("没有成功上传任何图片");
    process.exit(1);
  }

  // 重写 frontmatter 的 images 字段为数组
  const imagesYaml = urls.map((u) => `  - "${u}"`).join("\n");
  const newRaw = raw.replace(/^images:.*$/m, `images:\n${imagesYaml}`);
  fs.writeFileSync(TARGET, newRaw, "utf-8");
  console.log("\n✅ 已重写 images 字段为完整 URL 数组");
  console.log("完成!");
}

main().catch((e) => { console.error("失败:", e); process.exit(1); });
