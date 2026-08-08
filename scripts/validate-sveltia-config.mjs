// 验证 public/admin/config.yml（Sveltia CMS 配置）
// 用法：node scripts/validate-sveltia-config.mjs
// 检查：YAML 可解析、backend 配置完整、folder 路径存在、字段 widget 类型合法、字段表与预期对齐
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, "public/admin/config.yml");

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

// 预期字段表（与 src/content.config.ts 的 zod 对齐）
const EXPECTED_FIELDS = {
	posts: ["title", "published", "updated", "draft", "description", "image", "tags", "category", "lang", "pinned", "author", "sourceLink", "licenseName", "licenseUrl", "comment", "order", "descriptionSource", "body"],
	moments: ["published", "author", "avatar", "tags", "images", "location", "device", "pinned", "body"],
	friends: ["title", "imgurl", "desc", "siteurl", "tags", "weight", "enabled"],
	apps: ["title", "imgurl", "desc", "siteurl", "tags", "weight", "enabled"],
	daohang: ["name", "url", "icon", "description", "category", "tags", "color", "image", "featured", "order", "body"],
	album: ["title", "subtitle", "cover", "date", "location", "tags", "draft", "imgbedFolder", "photos", "body"],
	ziyuan: ["title", "content", "closable", "link", "quotes"],
	"life-places": ["date", "id", "province", "city", "experience", "visitCount", "lat", "lng", "amap-coords", "url", "urlLabel", "tags", "photos", "body"],
	"life-notebooks-entries": ["name", "date", "cover", "summary", "image", "tags", "body"],
};

const WIDGETS = new Set([
	"string", "text", "markdown", "number", "boolean", "datetime", "date",
	"select", "list", "object", "image", "file", "code", "color", "relation", "map",
	"imgbed", "amap-geocode", // 自定义 widget
]);
const NAME_RE = /^[a-zA-Z0-9-_]+$/;

const errors = [];
const warn = (msg) => console.log(`  ⚠ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

// 1. YAML 可解析
let config;
try {
	config = load(readFileSync(CONFIG_PATH, "utf8"));
	ok("config.yml YAML 可解析");
} catch (e) {
	console.error("✗ YAML 解析失败:", e.message);
	process.exit(1);
}

// 2. backend
const backend = config?.backend || {};
if (backend.name !== "github") errors.push("backend.name 应为 github");
if (!backend.repo) errors.push("缺少 backend.repo");
if (!backend.branch) errors.push("缺少 backend.branch");
if (!backend.base_url) errors.push("缺少 backend.base_url");
if (backend.auth_endpoint !== "oauth") errors.push("backend.auth_endpoint 应为 oauth");
ok(`backend: ${backend.name} ${backend.repo}@${backend.branch} oauth=${backend.base_url}/${backend.auth_endpoint}`);

// 3. media
if (!config.media_folder) warn("未配置 media_folder（备用媒体库）");

// 4. collections
const collections = {};
for (const c of config?.collections ?? []) {
	if (!NAME_RE.test(c.name ?? "")) errors.push(`collection 名称非法: ${c.name}`);
	if (!c.folder) {
		errors.push(`${c.name}: 缺少 folder`);
	} else if (!existsSync(join(ROOT, c.folder))) {
		errors.push(`${c.name}: folder 不存在: ${c.folder}`);
	}
	if (!c.extension) warn(`${c.name}: 未指定 extension（默认 md）`);
	if (!Array.isArray(c.fields) || c.fields.length === 0) errors.push(`${c.name}: 缺少 fields`);
	// nested collections 必须有 meta.path（Decap 树形文件夹定位用）
	if (c.nested && (!c.meta?.path?.widget || !c.meta?.path?.label)) {
		errors.push(`${c.name}: nested 集合必须配置 meta.path`);
	} else if (c.nested) {
		ok(`${c.name}: nested 树形 ${c.nested.depth || 10} 层`);
	}

	const declared = (c.fields ?? []).map((f) => f.name);
	for (const f of c.fields ?? []) {
		if (!NAME_RE.test(f.name)) errors.push(`${c.name}.${f.name}: 字段名非法`);
		if (!WIDGETS.has(f.widget)) errors.push(`${c.name}.${f.name}: widget 类型非法: ${f.widget}`);
		// 嵌套字段（object/list 的 fields）递归检查
		for (const sub of f.fields ?? []) {
			if (!NAME_RE.test(sub.name)) errors.push(`${c.name}.${f.name}.${sub.name}: 子字段名非法`);
			if (!WIDGETS.has(sub.widget)) errors.push(`${c.name}.${f.name}.${sub.name}: widget 非法: ${sub.widget}`);
		}
	}
	const dup = declared.filter((n, i) => declared.indexOf(n) !== i);
	if (dup.length) errors.push(`${c.name}: 字段重名: ${dup.join(",")}`);
	ok(`${c.name}: folder=${c.folder} 字段 ${declared.length} 个`);
	collections[c.name] = declared;
}

// 5. 字段表比对
for (const [name, expected] of Object.entries(EXPECTED_FIELDS)) {
	const declared = collections[name];
	if (!declared) {
		errors.push(`缺少预期集合: ${name}`);
		continue;
	}
	const missing = expected.filter((f) => !declared.includes(f));
	const extra = declared.filter((f) => !expected.includes(f));
	if (missing.length) errors.push(`${name}: 缺失字段 ${missing.join(",")}`);
	if (extra.length) warn(`${name}: 额外字段 ${extra.join(",")}（预期表未声明）`);
}

// 6. 汇总
console.log("\n================================");
if (errors.length) {
	console.log(`✗ 校验失败：${errors.length} 个错误`);
	for (const e of errors) console.log(`  ✗ ${e}`);
	process.exit(1);
}
console.log("✓ 全部通过");
