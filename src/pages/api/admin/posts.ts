/**
 * /api/admin/posts — 文章 CRUD
 */
import type { APIRoute } from "astro";
import { getJwtSecret, requireAuth } from "@/utils/admin/auth";
import {
  deleteContentFile,
  readContentDirRecursive,
  readSubdirs,
  writeContentFile,
} from "@/utils/admin/content-writer";


const COLLECTION_DIR = "src/content/posts";

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

function slugify(str: string): string {
  return safeFilename(str).replace(/[#?&]/g, "");
}

function fmToPost(fm: Record<string, unknown>, body: string, filePath: string) {
  const pub = fm.published ? new Date(fm.published as string) : new Date(0);
  return {
    title: (fm.title as string) || "",
    published: pub.toISOString(),
    draft: fm.draft === true,
    description: (fm.description as string) || "",
    image: (fm.image as string) || "",
    tags: Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []),
    category: (fm.category as string) || "",
    pinned: fm.pinned === true,
    order: (fm.order as number) || 0,
    content: body,
    filePath: filePath.replace(/\\/g, "/"),
  };
}

// 从文件路径推导分类
function categoryFromPath(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const rel = norm.replace(COLLECTION_DIR + "/", "");
  const parts = rel.split("/");
  if (parts.length > 1) return parts[0];
  return "";
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const category = url.searchParams.get("category") || "";

  // 返回分类列表
  if (action === "categories") {
    const dirs = await readSubdirs(COLLECTION_DIR);
    // 过滤掉 images/assets 等非文章目录
    const catDirs = dirs.filter(
      (d) => !["images", "assets"].includes(d.toLowerCase())
    );
    return json({ success: true, data: catDirs });
  }

  // 列出文章
  const result = await readContentDirRecursive(COLLECTION_DIR);
  if (!result.success || !result.data) {
    return json({ success: false, error: result.error }, 500);
  }

  let posts = result.data
    .filter((f) => {
      const np = f.filePath.replace(/\\/g, "/");
      return !np.includes("/assets/") && !np.includes("/images/");
    })
    .map((f) => fmToPost(f.frontmatter, f.body, f.filePath));

  // 按分类筛选
  if (category) {
    posts = posts.filter((p) => p.category === category || categoryFromPath(p.filePath) === category);
  }

  // 先按 pinned 排，再按 published 降序
  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.published).getTime() - new Date(a.published).getTime();
  });

  return json({ success: true, data: posts });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = (body.title as string) || "";
  const category = (body.category as string) || "未分类";
  const content = (body.content as string) || "";

  if (!title) {
    return json({ success: false, error: "请输入标题" }, 400);
  }

  if (!category) {
    return json({ success: false, error: "请选择分类" }, 400);
  }

  const filename = slugify(title) + ".md";
  const catDir = safeFilename(category);
  const fileRelPath = `${COLLECTION_DIR}/${catDir}/${filename}`;

  const fm: Record<string, unknown> = {
    title,
    published: body.published || new Date().toISOString().split("T")[0],
    category,
  };
  if (body.description) fm.description = body.description;
  if (body.image) fm.image = body.image;
  if (Array.isArray(body.tags) && body.tags.length) fm.tags = body.tags;
  if (body.draft === true) fm.draft = true;
  if (body.pinned === true) fm.pinned = true;
  if (body.order) fm.order = body.order;
  if (body.lang) fm.lang = body.lang;
  if (body.author) fm.author = body.author;
  if (body.sourceLink) fm.sourceLink = body.sourceLink;

  const result = await writeContentFile(fileRelPath, fm, content);
  if (!result.success) {
    return json({ success: false, error: result.error }, 500);
  }

  return json({ success: true, filePath: fileRelPath });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const filePath = (body.filePath as string) || "";

  if (!filePath) {
    return json({ success: false, error: "缺少 filePath" }, 400);
  }

  const title = (body.title as string) || "";
  const category = (body.category as string) || "";
  const content = (body.content as string) || "";

  const fm: Record<string, unknown> = {
    title,
    published: body.published || new Date().toISOString().split("T")[0],
    category,
  };
  if (body.description) fm.description = body.description;
  if (body.image) fm.image = body.image;
  if (Array.isArray(body.tags) && body.tags.length) fm.tags = body.tags;
  if (body.draft === true) fm.draft = true;
  if (body.pinned === true) fm.pinned = true;
  if (body.order) fm.order = body.order;
  if (body.lang) fm.lang = body.lang;
  if (body.author) fm.author = body.author;
  if (body.sourceLink) fm.sourceLink = body.sourceLink;

  const result = await writeContentFile(filePath, fm, content);
  if (!result.success) {
    return json({ success: false, error: result.error }, 500);
  }

  return json({ success: true });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const filePath = (body.filePath as string) || "";

  if (!filePath) {
    return json({ success: false, error: "缺少 filePath" }, 400);
  }

  const result = await deleteContentFile(filePath);
  if (!result.success) {
    return json({ success: false, error: result.error }, 500);
  }

  return json({ success: true });
};
