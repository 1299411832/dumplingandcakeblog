// 验证 .pages.yml：YAML 可解析、name/type 规范、path 存在、字段清单与预期表比对
// 用法：node scripts/validate-pages-yml.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, ".pages.yml");

// 动态定位 js-yaml 包（pnpm 严格模式，无顶层提升）
const pnpmDir = join(ROOT, "node_modules/.pnpm");
const jsYamlDir = readdirSync(pnpmDir).find(
	(d) =>
		d.startsWith("js-yaml@") &&
		existsSync(join(pnpmDir, d, "node_modules/js-yaml/dist/js-yaml.mjs")),
);
if (!jsYamlDir) {
	console.error("✗ 找不到 node_modules/.pnpm/js-yaml@*");
	process.exit(1);
}
const { load } = await import(
	pathToFileURL(join(pnpmDir, jsYamlDir, "node_modules/js-yaml/dist/js-yaml.mjs")).href
);

// 预期字段表（与 content.config.ts 的 zod 对齐；hidden 字段保 round-trip）
const EXPECTED_FIELDS = {
	posts: ["title", "published", "updated", "draft", "description", "image", "tags", "category", "lang", "pinned", "author", "sourceLink", "licenseName", "licenseUrl", "comment", "order", "prevTitle", "prevSlug", "nextTitle", "nextSlug", "body"],
	moments: ["published", "author", "avatar", "tags", "images", "location", "device", "pinned", "id", "body"],
	friends: ["title", "imgurl", "desc", "siteurl", "tags", "weight", "enabled"],
	apps: ["title", "imgurl", "desc", "siteurl", "tags", "weight", "enabled"],
	daohang: ["name", "url", "icon", "description", "category", "tags", "color", "image", "featured", "order", "body"],
	album: ["title", "subtitle", "cover", "date", "location", "tags", "draft", "imgbedFolder", "photos", "body"],
	"ziyuan-resource": ["title", "content", "closable", "link"],
	"ziyuan-quote": ["title", "quotes"],
	"life-places": ["date", "id", "province", "city", "experience", "visitCount", "lat", "lng", "url", "urlLabel", "tags", "photos", "body"],
	"life-notebooks-index": ["name", "cover", "summary", "image", "tags", "date"],
	"life-notebooks-entries": ["name", "date", "cover", "summary", "image", "tags", "body"],
};

const FIELD_TYPES = new Set([
	"string", "text", "number", "boolean", "date", "datetime",
	"image", "file", "select", "object", "code", "rich-text", "uuid", "block",
]);
const NAME_RE = /^[a-zA-Z0-9-_]+$/;

const errors = [];
const warn = (msg) => console.log(`  ⚠ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

// 1. YAML 可解析
let config;
try {
	config = load(readFileSync(CONFIG_PATH, "utf8"));
	ok(".pages.yml YAML 可解析");
} catch (e) {
	console.error("✗ YAML 解析失败:", e.message);
	process.exit(1);
}

// 2. 顶层结构
if (!Array.isArray(config?.media)) errors.push("media 必须是数组");
if (!Array.isArray(config?.content)) errors.push("content 必须是数组");
if (config?.settings?.content?.merge !== false) errors.push("settings.content.merge 应为 false");

// 3. 遍历 content
const collections = {};
for (const group of config.content ?? []) {
	if (!NAME_RE.test(group.name ?? "")) errors.push(`group 名称非法: ${group.name}`);
	if (group.type !== "group") errors.push(`content 顶层项 type 应为 group: ${group.name}`);
	if (!Array.isArray(group.items)) {
		errors.push(`group ${group.name} 缺少 items`);
		continue;
	}
	for (const item of group.items) {
		if (!NAME_RE.test(item.name ?? "")) errors.push(`collection 名称非法: ${item.name}`);
		if (!["collection", "file"].includes(item.type)) errors.push(`${item.name}: type 非法: ${item.type}`);

		if (item.type === "collection") {
			if (!item.path || !existsSync(join(ROOT, item.path))) errors.push(`${item.name}: path 不存在: ${item.path}`);
			if (!item.filename?.template) errors.push(`${item.name}: 缺少 filename.template`);
			if (item.filename?.field !== "create") warn(`${item.name}: filename.field 不是 create（建议手动输入文件名）`);
			ok(`${item.name}: path=${item.path} filename=${item.filename?.template}`);
		}

		// 字段检查
		const declared = (item.fields ?? []).map((f) => f.name);
		for (const f of item.fields ?? []) {
			if (!NAME_RE.test(f.name)) errors.push(`${item.name}.${f.name}: 字段名非法`);
			if (!FIELD_TYPES.has(f.type)) errors.push(`${item.name}.${f.name}: type 非法: ${f.type}`);
		}
		// 重名检查
		const dup = declared.filter((n, i) => declared.indexOf(n) !== i);
		if (dup.length) errors.push(`${item.name}: 字段重名: ${dup.join(",")}`);
		collections[item.name] = declared;
	}
}

// 4. 字段表比对
for (const [name, expected] of Object.entries(EXPECTED_FIELDS)) {
	const declared = collections[name];
	if (!declared) {
		errors.push(`缺少预期集合: ${name}`);
		continue;
	}
	const missing = expected.filter((f) => !declared.includes(f));
	const extra = declared.filter((f) => !expected.includes(f));
	if (missing.length) errors.push(`${name}: 缺失字段 ${missing.join(",")}`);
	if (extra.length) warn(`${name}: 额外字段 ${extra.join(",")}（预期表未声明，检查是否多余）`);
}

// 5. 汇总
console.log("\n================================");
if (errors.length) {
	console.log(`✗ 校验失败：${errors.length} 个错误`);
	for (const e of errors) console.log(`  ✗ ${e}`);
	process.exit(1);
}
console.log("✓ 全部通过");
