/**
 * /api/admin/places — 足迹 CRUD
 */
import type { APIRoute } from "astro";


import { getJwtSecret, requireAuth } from "@/utils/admin/auth";
import {
	deleteContentFile,
	readContentDir,
	writeContentFile,
} from "@/utils/admin/content-writer";

const COLLECTION_DIR = "src/content/life/places";

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async ({ cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const result = await readContentDir(COLLECTION_DIR);
	if (!result.success || !result.data) {
		return json({ success: false, error: result.error }, 500);
	}

	const entries = result.data.map((f) => ({
		id: (f.frontmatter.id as string) || "",
		province: (f.frontmatter.province as string) || "",
		city: (f.frontmatter.city as string) || "",
		lat: f.frontmatter.lat ?? "",
		lng: f.frontmatter.lng ?? "",
		date: (f.frontmatter.date as string) || "",
		experience: (f.frontmatter.experience as string) || "",
		visitCount: f.frontmatter.visitCount || 1,
		tags: (f.frontmatter.tags as string[]) || [],
		url: (f.frontmatter.url as string) || "",
		urlLabel: (f.frontmatter.urlLabel as string) || "",
		photos: (f.frontmatter.photos as string[]) || [],
		markerColor: (f.frontmatter.markerColor as string) || "sunset",
	}));

	// 按日期降序
	entries.sort(
		(a, b) =>
			new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
	);

	return json({ success: true, data: entries });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	const _authErr = await requireAuth(cookies, getJwtSecret());
	if (_authErr) return _authErr;

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const province = (body.province as string) || "";
	const city = (body.city as string) || "";
	const lat = body.lat ?? "";
	const lng = body.lng ?? "";
	const date =
		(body.date as string) || new Date().toISOString().split("T")[0];
	const entryId = (body.id as string) || `p-${Date.now()}`;

	if (!province && !city) {
		return json({ success: false, error: "请填写省份或城市" }, 400);
	}

	if (!lat || !lng) {
		return json({ success: false, error: "请获取或填写经纬度" }, 400);
	}

	// 生成文件名（按日期）
	const dateBase = date.slice(0, 10);
	let filename = `${dateBase}.md`;

	// 去重
	const existing = await readContentDir(COLLECTION_DIR);
	const existingNames = new Set(existing.data?.map((f) => f.filename) || []);
	let suffix = 2;
	while (existingNames.has(filename)) {
		filename = `${dateBase}-${suffix}.md`;
		suffix++;
	}

	// id 去重
	if (existing.success && existing.data) {
		for (const f of existing.data) {
			if (f.frontmatter.id === entryId) {
				return json({ success: false, error: "该足迹已存在" }, 409);
			}
		}
	}

	const COLORS = ["sunset", "ocean", "forest", "lavender", "sunshine", "rose"];
	const markerColor =
		(body.markerColor as string) ||
		COLORS[(existing.data?.length || 0) % COLORS.length];

	const fm: Record<string, unknown> = {
		id: entryId,
		date,
		province,
		city,
		lat: typeof lat === "string" ? Number.parseFloat(lat) || lat : lat,
		lng: typeof lng === "string" ? Number.parseFloat(lng) || lng : lng,
		experience: (body.experience as string) || "",
		visitCount: body.visitCount || 1,
		markerColor,
	};
	if (body.url) fm.url = body.url;
	if (body.urlLabel) fm.urlLabel = body.urlLabel;
	if ((body.photos as string[])?.length) fm.photos = body.photos;
	if ((body.tags as string[])?.length) fm.tags = body.tags;

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
	const entryId = (body.id as string) || "";

	if (!entryId) {
		return json({ success: false, error: "缺少 id" }, 400);
	}

	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === entryId);
	if (!target) {
		return json({ success: false, error: "未找到该足迹" }, 404);
	}

	const lat = body.lat ?? target.frontmatter.lat;
	const lng = body.lng ?? target.frontmatter.lng;

	const fm: Record<string, unknown> = {
		id: entryId,
		date: (body.date as string) || target.frontmatter.date,
		province: (body.province as string) || target.frontmatter.province,
		city: (body.city as string) || target.frontmatter.city,
		lat: typeof lat === "string" ? Number.parseFloat(lat) || lat : lat,
		lng: typeof lng === "string" ? Number.parseFloat(lng) || lng : lng,
		experience: (body.experience as string) || target.frontmatter.experience,
		visitCount: body.visitCount || target.frontmatter.visitCount || 1,
		markerColor: (body.markerColor as string) || (target.frontmatter.markerColor as string) || "sunset",
	};
	if (body.url || target.frontmatter.url) fm.url = body.url || target.frontmatter.url;
	if (body.urlLabel || target.frontmatter.urlLabel) fm.urlLabel = body.urlLabel || target.frontmatter.urlLabel;
	if ((body.photos as string[])?.length) fm.photos = body.photos;
	else if ((target.frontmatter.photos as string[])?.length) fm.photos = target.frontmatter.photos;
	if ((body.tags as string[])?.length) fm.tags = body.tags;
	else if ((target.frontmatter.tags as string[])?.length) fm.tags = target.frontmatter.tags;

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
	const entryId = (body.id as string) || "";

	if (!entryId) {
		return json({ success: false, error: "缺少 id" }, 400);
	}

	const existing = await readContentDir(COLLECTION_DIR);
	if (!existing.success || !existing.data) {
		return json({ success: false, error: "读取数据失败" }, 500);
	}

	const target = existing.data.find((f) => f.frontmatter.id === entryId);
	if (!target) {
		return json({ success: false, error: "未找到该足迹" }, 404);
	}

	const result = await deleteContentFile(target.filePath);
	if (!result.success) {
		return json({ success: false, error: result.error }, 500);
	}

	return json({ success: true });
};
