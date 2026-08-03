/**
 * /api/admin/moments — 说说 CRUD
 */
import type { APIRoute } from "astro";


import { getJwtSecret, requireAuth } from "@/utils/admin/auth";
export const prerender = false;

import {
	deleteContentFile,
	readContentDir,
	writeContentFile,
} from "@/utils/admin/content-writer";

const COLLECTION_DIR = "src/content/moments";

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

/** 根据 published 日期生成文件名 */
function momentFilename(dateStr: string): string {
	const datePart = dateStr.slice(0, 10); // YYYY-MM-DD
	return `${datePart}.md`;
}

/** 把 frontmatter + body 转成 Gist 兼容的 JSON 格式（供 Admin 页面使用） */
function fmToMomentEntry(fp: string, fm: Record<string, unknown>, body: string) {
	// 从 filename 中提取 id（如果有的话）
	const published = fm.published ? String(fm.published) : "";
	// 如果 published 格式是 Date 对象，转字符串
	const dateStr = published
		? (() => {
				const d = new Date(published);
				const pad = (n: number) => String(n).padStart(2, "0");
				return [
					d.getFullYear(),
					"-",
					pad(d.getMonth() + 1),
					"-",
					pad(d.getDate()),
					" ",
					pad(d.getHours()),
					":",
					pad(d.getMinutes()),
					":",
					pad(d.getSeconds()),
				].join("");
			})()
		: "";

	return {
		id: (fm.id as string) || "",
		content: body,
		published: dateStr,
		images: Array.isArray(fm.images) ? fm.images as string[] : (fm.images ? [fm.images as string] : []),
		tags: Array.isArray(fm.tags) ? fm.tags as string[] : (fm.tags ? [fm.tags as string] : []),
		location: (fm.location as string) || "",
		pinned: fm.pinned === true,
		device: (fm.device as string) || "",
		author: (fm.author as string) || "团子",
		avatar: (fm.avatar as string) || "/assets/ziyuan/tx.webp",
	};
}

export const GET: APIRoute = async ({ cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const result = await readContentDir(COLLECTION_DIR);
	if (!result.success || !result.data) {
		return json({ success: false, error: result.error }, 500);
	}

	const entries = result.data.map((f) =>
		fmToMomentEntry(f.filePath, f.frontmatter, f.body),
	);

	// 按 published 降序
	entries.sort(
		(a, b) =>
			new Date(b.published).getTime() - new Date(a.published).getTime(),
	);

	return json({ success: true, data: entries });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const content = (body.content as string) || "";
	const published = (body.published as string) || new Date().toISOString();
	const images = (body.images as string[]) || [];
	const tags = (body.tags as string[]) || [];
	const location = (body.location as string) || "";
	const pinned = body.pinned === true;
	const id = (body.id as string) || `ext-${Date.now()}`;

	if (!content.trim()) {
		return json({ success: false, error: "请输入内容" }, 400);
	}

	const fm: Record<string, unknown> = {
		id,
		published,
		author: (body.author as string) || "团子",
		avatar: (body.avatar as string) || "/assets/ziyuan/tx.webp",
	};
	if (pinned) fm.pinned = true;
	if (tags.length) fm.tags = tags;
	if (location) fm.location = location;
	if (images.length) fm.images = images;
	if (body.device) fm.device = body.device;

	// 去重：检查 id 是否已存在
	const existing = await readContentDir(COLLECTION_DIR);
	if (existing.success && existing.data) {
		for (const f of existing.data) {
			if (f.frontmatter.id === id) {
				return json(
					{ success: false, error: "该说说已存在" },
					409,
				);
			}
		}
	}

	// 文件名生成 + 去重
	const baseFilename = momentFilename(published);
	let filename = baseFilename;
	let suffix = 2;
	const existingFilenames = new Set(
		existing.data?.map((f) => f.filename) || [],
	);
	while (existingFilenames.has(filename)) {
		filename = `${baseFilename.replace(".md", "")}-${suffix}.md`;
		suffix++;
	}

	const result = await writeContentFile(
		`${COLLECTION_DIR}/${filename}`,
		fm,
		content,
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
	const id = body.id as string;

	if (!id) {
		return json({ success: false, error: "缺少 id" }, 400);
	}

	// 查找匹配的文件
	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === id);
	if (!target) {
		return json({ success: false, error: "未找到该说说" }, 404);
	}

	const content = (body.content as string) || "";
	const published = (body.published as string) || "";
	const images = (body.images as string[]) || [];
	const tags = (body.tags as string[]) || [];
	const location = (body.location as string) || "";
	const pinned = body.pinned === true;

	const fm: Record<string, unknown> = {
		id,
		published,
		author: (body.author as string) || "团子",
		avatar: (body.avatar as string) || "/assets/ziyuan/tx.webp",
	};
	if (pinned) fm.pinned = true;
	if (tags.length) fm.tags = tags;
	if (location) fm.location = location;
	if (images.length) fm.images = images;
	if (body.device) fm.device = body.device;

	const result = await writeContentFile(target.filePath, fm, content);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const id = body.id as string;

	if (!id) {
		return json({ success: false, error: "缺少 id" }, 400);
	}

	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === id);
	if (!target) {
		return json({ success: false, error: "未找到该说说" }, 404);
	}

	const result = await deleteContentFile(target.filePath);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};
