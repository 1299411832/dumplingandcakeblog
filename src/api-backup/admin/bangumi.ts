/**
 * /api/admin/bangumi — 影视/书籍/音乐/游戏 CRUD
 */
import type { APIRoute } from "astro";


import { getJwtSecret, requireAuth } from "@/utils/admin/auth";
export const prerender = false;

import {
	deleteContentFile,
	readContentDirRecursive,
	writeContentFile,
} from "@/utils/admin/content-writer";

const COLLECTION_DIR = "src/content/bangumi";

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

function safeFilename(str: string): string {
	return str
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
		.replace(/\s+/g, "-")
		.substring(0, 100);
}

const VALID_CATEGORIES = ["anime", "book", "music", "game", "real"];

export const GET: APIRoute = async ({ cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const result = await readContentDirRecursive(COLLECTION_DIR);
	if (!result.success || !result.data) {
		return json({ success: false, error: result.error }, 500);
	}

	const entries = result.data.map((f) => ({
		id: (f.frontmatter.title as string) || "",
		title: (f.frontmatter.title as string) || "",
		name_cn: (f.frontmatter.name_cn as string) || "",
		category: (f.frontmatter.category as string) || "anime",
		subcategory: (f.frontmatter.subcategory as string) || undefined,
		status: f.frontmatter.status || 2,
		score: f.frontmatter.score || 0,
		image: (f.frontmatter.image as string) || "",
		comment: (f.frontmatter.comment as string) || "",
		tags: (f.frontmatter.tags as string[]) || [],
		published: f.frontmatter.published || undefined,
		link: (f.frontmatter.link as string) || "",
		artist: (f.frontmatter.artist as string) || "",
		audioUrl: (f.frontmatter.audioUrl as string) || "",
		lrcUrl: (f.frontmatter.lrcUrl as string) || "",
		metingServer: (f.frontmatter.metingServer as string) || "",
		metingId: (f.frontmatter.metingId as string) || "",
	}));

	return json({ success: true, data: entries });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const title = (body.title as string) || "";
	const nameCn = (body.name_cn as string) || "";
	const category = (body.category as string) || "anime";
	const subcategory = (body.subcategory as string) || undefined;

	if (!title && !nameCn) {
		return json({ success: false, error: "请填写标题" }, 400);
	}

	const displayTitle = title || nameCn;
	const filename = safeFilename(displayTitle) + ".md";

	// 确定目录：category 如果是无效值，默认 anime
	let categoryDir = category;
	if (!VALID_CATEGORIES.includes(categoryDir)) {
		categoryDir = "anime";
	}

	// 如果有 subcategory，放到子目录
	let dirPath = `${COLLECTION_DIR}/${categoryDir}`;
	if (subcategory) {
		dirPath += `/${safeFilename(subcategory)}`;
	}

	// 查重
	const existing = await readContentDirRecursive(COLLECTION_DIR);
	const existingTitles = new Set(
		existing.data?.map((f) => f.frontmatter.title as string) || [],
	);
	if (existingTitles.has(displayTitle)) {
		return json({ success: false, error: "该影视已存在" }, 409);
	}

	const fm: Record<string, unknown> = {
		title: displayTitle,
		category: categoryDir,
		status: body.status || 2,
		score: body.score || 0,
		image: (body.image as string) || "",
		comment: (body.comment as string) || "",
	};
	if (nameCn && nameCn !== displayTitle) fm.name_cn = nameCn;
	if (subcategory) fm.subcategory = subcategory;
	if ((body.tags as string[])?.length) fm.tags = body.tags;
	if (body.link) fm.link = body.link;
	if (body.published) fm.published = body.published;
	if (body.artist) fm.artist = body.artist;
	if (body.audioUrl) fm.audioUrl = body.audioUrl;
	if (body.lrcUrl) fm.lrcUrl = body.lrcUrl;
	if (body.metingServer) fm.metingServer = body.metingServer;
	if (body.metingId) fm.metingId = body.metingId;

	const result = await writeContentFile(
		`${dirPath}/${filename}`,
		fm,
		(body.comment as string) || "",
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
	const title = (body.title as string) || "";

	if (!title) {
		return json({ success: false, error: "缺少 title" }, 400);
	}

	const existing = await readContentDirRecursive(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find(
		(f) => f.frontmatter.title === title,
	);
	if (!target) {
		return json({ success: false, error: "未找到该影视" }, 404);
	}

	const category = (body.category as string) || (target.frontmatter.category as string) || "anime";
	const nameCn = (body.name_cn as string) || "";

	const fm: Record<string, unknown> = {
		title,
		category,
		status: body.status ?? target.frontmatter.status ?? 2,
		score: body.score ?? target.frontmatter.score ?? 0,
		image: (body.image as string) || (target.frontmatter.image as string) || "",
		comment: (body.comment as string) || (target.frontmatter.comment as string) || "",
	};
	if (nameCn && nameCn !== title) fm.name_cn = nameCn;
	if (body.subcategory || target.frontmatter.subcategory) {
		fm.subcategory = body.subcategory || target.frontmatter.subcategory;
	}
	if ((body.tags as string[])?.length) fm.tags = body.tags;
	else if ((target.frontmatter.tags as string[])?.length) fm.tags = target.frontmatter.tags;
	if (body.link || target.frontmatter.link) fm.link = body.link || target.frontmatter.link;
	if (body.published || target.frontmatter.published) fm.published = body.published || target.frontmatter.published;
	if (body.artist || target.frontmatter.artist) fm.artist = body.artist || target.frontmatter.artist;

	const result = await writeContentFile(
		target.filePath,
		fm,
		(body.comment as string) || target.body,
	);

	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const title = (body.title as string) || "";

	if (!title) {
		return json({ success: false, error: "缺少 title" }, 400);
	}

	const existing = await readContentDirRecursive(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find(
		(f) => f.frontmatter.title === title,
	);
	if (!target) {
		return json({ success: false, error: "未找到该影视" }, 404);
	}

	const result = await deleteContentFile(target.filePath);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};
