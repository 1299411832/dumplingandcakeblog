/**
 * /api/admin/notebooks — 笔记 CRUD
 */
import type { APIRoute } from "astro";


import { getJwtSecret, requireAuth } from "@/utils/admin/auth";
export const prerender = false;

import {
	deleteContentFile,
	readContentDir,
	readSubdirs,
	writeContentFile,
} from "@/utils/admin/content-writer";

const COLLECTION_DIR = "src/content/life/notebooks";

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

function fmToEntry(
	filePath: string,
	fm: Record<string, unknown>,
	body: string,
	notebookName: string,
) {
	const dateVal = fm.date ? String(fm.date) : "";
	// 尝试格式化日期
	let dateStr = dateVal;
	try {
		const d = new Date(dateVal);
		if (!Number.isNaN(d.getTime())) {
			dateStr = d.toISOString().split("T")[0];
		}
	} catch {}

	return {
		id: (fm.id as string) || "",
		notebook: notebookName,
		title: (fm.name as string) || (fm.title as string) || "",
		date: dateStr,
		content: body,
		createdAt: (fm.createdAt as string) || dateStr,
		updatedAt: (fm.updatedAt as string) || dateStr,
		tags: (fm.tags as string[]) || [],
	};
}

export const GET: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const url = new URL(request.url);
	const notebook = url.searchParams.get("notebook") || "";

	// 没有指定 notebook → 返回笔记本列表
	if (!notebook) {
		const dirs = await readSubdirs(COLLECTION_DIR);
		return json({ success: true, data: dirs });
	}

	// 读取指定笔记本下的所有条目
	const notebookDir = `${COLLECTION_DIR}/${notebook}`;
	const result = await readContentDir(notebookDir);
	if (!result.success || !result.data) {
		return json({ success: false, error: result.error }, 500);
	}

	const entries = result.data.map((f) =>
		fmToEntry(f.filePath, f.frontmatter, f.body, notebook),
	);

	// 按日期降序
	entries.sort(
		(a, b) =>
			new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
	);

	return json({ success: true, data: entries, notebook });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const notebook = (body.notebook as string) || "";
	const content = (body.content as string) || "";
	const title = (body.title as string) || "";
	const date = (body.date as string) || new Date().toISOString().split("T")[0];
	const entryId = (body.id as string) || `nb-${Date.now()}`;

	if (!notebook) {
		return json({ success: false, error: "请选择笔记本" }, 400);
	}

	if (!content.trim()) {
		return json({ success: false, error: "请输入内容" }, 400);
	}

	// 生成文件名：基于标题，如果标题为空则用日期
	const filenameBase = safeFilename(title || date);
	let filename = filenameBase ? `${filenameBase}.md` : `${date}.md`;

	// 去重
	const notebookDir = `${COLLECTION_DIR}/${notebook}`;
	const existing = await readContentDir(notebookDir);
	const existingNames = new Set(existing.data?.map((f) => f.filename) || []);
	let suffix = 2;
	while (existingNames.has(filename)) {
		filename = `${filenameBase}-${suffix}.md`;
		suffix++;
	}

	// 检查 id 去重
	if (existing.success && existing.data) {
		for (const f of existing.data) {
			if (f.frontmatter.id === entryId) {
				return json({ success: false, error: "该笔记已存在" }, 409);
			}
		}
	}

	const fm: Record<string, unknown> = {
		id: entryId,
		name: title,
		date,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	if (body.tags?.length) fm.tags = body.tags;

	const result = await writeContentFile(
		`${notebookDir}/${filename}`,
		fm,
		content,
	);

	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true, notebook });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const entryId = (body.id as string) || "";
	const notebook = (body.notebook as string) || "";
	const content = (body.content as string) || "";
	const title = (body.title as string) || "";
	const date = (body.date as string) || "";

	if (!entryId || !notebook) {
		return json({ success: false, error: "缺少 id 或 notebook" }, 400);
	}

	const notebookDir = `${COLLECTION_DIR}/${notebook}`;
	const existing = await readContentDir(notebookDir);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === entryId);
	if (!target) {
		return json({ success: false, error: "未找到该笔记" }, 404);
	}

	const fm: Record<string, unknown> = {
		id: entryId,
		name: title,
		date: date || target.frontmatter.date,
		createdAt: target.frontmatter.createdAt || new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	if (body.tags?.length) fm.tags = body.tags;

	const result = await writeContentFile(target.filePath, fm, content);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true, notebook });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const entryId = (body.id as string) || "";
	const notebook = (body.notebook as string) || "";

	if (!entryId || !notebook) {
		return json({ success: false, error: "缺少 id 或 notebook" }, 400);
	}

	const notebookDir = `${COLLECTION_DIR}/${notebook}`;
	const existing = await readContentDir(notebookDir);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === entryId);
	if (!target) {
		return json({ success: false, error: "未找到该笔记" }, 404);
	}

	const result = await deleteContentFile(target.filePath);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};
