/**
 * /api/admin/friends — 友链 CRUD
 */
import type { APIRoute } from "astro";
export const prerender = false;



import { getJwtSecret, requireAuth } from "@/utils/admin/auth";


import {
	deleteContentFile,
	readContentDir,
	writeContentFile,
} from "@/utils/admin/content-writer";

const COLLECTION_DIR = "src/content/friends";

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function slugify(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9一-鿿]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 60);
}

export const GET: APIRoute = async ({ cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const result = await readContentDir(COLLECTION_DIR);
	if (!result.success || !result.data) {
		return json({ success: false, error: result.error }, 500);
	}

	const entries = result.data.map((f) => ({
		id: (f.frontmatter.siteurl as string) || "",
		title: (f.frontmatter.title as string) || "",
		desc: (f.frontmatter.desc as string) || "",
		siteurl: (f.frontmatter.siteurl as string) || "",
		imgurl: (f.frontmatter.imgurl as string) || "",
		tags: (f.frontmatter.tags as string[]) || [],
		weight: f.frontmatter.weight || 0,
		enabled: f.frontmatter.enabled !== false,
	}));

	return json({ success: true, data: entries });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const title = (body.title as string) || "";
	const siteurl = (body.siteurl as string) || "";

	if (!title || !siteurl) {
		return json({ success: false, error: "缺少标题或链接" }, 400);
	}

	// 查重
	const existing = await readContentDir(COLLECTION_DIR);
	const existingUrls = new Set(
		existing.data?.map((f) => f.frontmatter.siteurl as string) || [],
	);
	if (existingUrls.has(siteurl)) {
		return json({ success: false, error: "该友链已存在" }, 409);
	}

	// 生成文件名
	const existingCount =
		existing.data?.filter((f) => f.filename.endsWith(".md")).length || 0;
	const index = existingCount + 1;
	const slug = slugify(title) || `friend-${index}`;
	const filename = `${String(index).padStart(2, "0")}-${slug}.md`;

	const fm: Record<string, unknown> = {
		title,
		imgurl: (body.imgurl as string) || "",
		desc: (body.desc as string) || "",
		siteurl,
	};
	if ((body.tags as string[])?.length) fm.tags = body.tags;
	if (body.weight) fm.weight = body.weight;
	if (body.enabled === false) fm.enabled = false;

	const result = await writeContentFile(
		`${COLLECTION_DIR}/${filename}`,
		fm,
		"",
	);

	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const siteurl = (body.siteurl as string) || "";

	if (!siteurl) {
		return json({ success: false, error: "缺少 siteurl" }, 400);
	}

	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find(
		(f) => f.frontmatter.siteurl === siteurl,
	);
	if (!target) {
		return json({ success: false, error: "未找到该友链" }, 404);
	}

	const fm: Record<string, unknown> = {
		title: (body.title as string) || target.frontmatter.title,
		imgurl: (body.imgurl as string) || target.frontmatter.imgurl,
		desc: (body.desc as string) || target.frontmatter.desc,
		siteurl,
	};
	if ((body.tags as string[])?.length) fm.tags = body.tags;
	if (body.weight !== undefined) fm.weight = body.weight;
	if (body.enabled !== undefined) fm.enabled = body.enabled;

	const result = await writeContentFile(target.filePath, fm, "");
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const siteurl = (body.siteurl as string) || "";

	if (!siteurl) {
		return json({ success: false, error: "缺少 siteurl" }, 400);
	}

	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find(
		(f) => f.frontmatter.siteurl === siteurl,
	);
	if (!target) {
		return json({ success: false, error: "未找到该友链" }, 404);
	}

	const result = await deleteContentFile(target.filePath);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};
