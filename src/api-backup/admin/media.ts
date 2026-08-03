/**
 * /api/admin/media — CloudFlare ImgBed 代理 + 本地素材库
 * ?source=imgbed (默认) → ImgBed API
 * ?source=local → public/assets/ziyuan 本地文件
 */
import type { APIRoute } from "astro";

import fs from "node:fs";
import path from "node:path";
import { getJwtSecret, requireAuth } from "@/utils/admin/auth";




const LOCAL_BASE = "public/assets/ziyuan";
const LOCAL_URL_PREFIX = "/assets/ziyuan";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function getImgBedConfig() {
  return {
    url: (import.meta.env.PUBLIC_IMAGEBED_URL || "").replace(/\/+$/, ""),
    authCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
    token: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
    folder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "",
  };
}

// ─── 本地文件操作 ─────────────────────────────────

const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"]);

function handleLocalGet(dir: string): Response {
  const baseDir = path.resolve(LOCAL_BASE);
  const targetDir = dir ? path.resolve(baseDir, dir) : baseDir;

  // 安全检查：确保在 baseDir 内
  if (!targetDir.startsWith(baseDir)) {
    return json({ success: false, error: "无效目录" }, 400);
  }

  if (!fs.existsSync(targetDir)) {
    return json({ success: true, files: [] });
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const files: Array<{ name: string; type: string; url: string; size: number; mtime: string }> = [];
  const dirs: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      dirs.push(relPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMG_EXTS.has(ext)) continue;
      const fullPath = path.join(targetDir, entry.name);
      const stat = fs.statSync(fullPath);
      files.push({
        name: relPath,
        type: `image/${ext.slice(1)}`,
        url: `${LOCAL_URL_PREFIX}/${relPath}`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  // 先目录后文件
  return json({
    success: true,
    files,
    dirs: dirs.sort(),
    source: "local",
  });
}

function handleLocalDirs(dir: string): Response {
  const baseDir = path.resolve(LOCAL_BASE);
  const targetDir = dir ? path.resolve(baseDir, dir) : baseDir;

  if (!targetDir.startsWith(baseDir)) {
    return json({ success: false, error: "无效目录" }, 400);
  }

  if (!fs.existsSync(targetDir)) {
    return json({ success: true, data: [] });
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const dirs: string[] = [];

  // 非根目录时，添加返回上级的选项
  if (dir) dirs.push(dir.includes("/") ? dir.substring(0, dir.lastIndexOf("/")) : "");

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      const relPath = dir ? `${dir}/${entry.name}` : entry.name;
      dirs.push(relPath);
    }
  }

  return json({ success: true, data: dirs, source: "local" });
}

// ─── GET: 列出文件或目录 ───────────────────────────

export const GET: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";
  const dir = url.searchParams.get("dir") || "";
  const start = parseInt(url.searchParams.get("start") || "0");
  const count = parseInt(url.searchParams.get("count") || "50");
  const source = url.searchParams.get("source") || "imgbed";

  // ── 本地素材库 ──
  if (source === "local") {
    if (action === "dirs") return handleLocalDirs(dir);
    return handleLocalGet(dir);
  }

  // ── ImgBed ──
  const config = getImgBedConfig();
  if (!config.url || !config.token) {
    return json({ success: false, error: "未配置 ImgBed" }, 500);
  }

  try {
    // 列出目录内容
    if (action === "list") {
      const params = new URLSearchParams();
      params.set("count", String(count));
      params.set("start", String(start));
      if (dir) params.set("dir", dir);
      else if (config.folder) params.set("dir", config.folder);

      const apiUrl = `${config.url}/api/manage/list?${params.toString()}`;
      const resp = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
      });
      const data = await resp.json();
      return json({ success: resp.ok, ...data, source: "imgbed" }, resp.ok ? 200 : resp.status);
    }

    // 列出可用目录（从文件列表推导）
    if (action === "dirs") {
      const params = new URLSearchParams();
      params.set("count", "100");
      if (config.folder) params.set("dir", config.folder);

      const apiUrl = `${config.url}/api/manage/list?${params.toString()}`;
      const resp = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
      });
      const data = await resp.json();

      const dirs = new Set<string>();
      if (config.folder) dirs.add(config.folder);
      dirs.add("picgo"); // 额外已知目录

      const files = data?.files || data?.data?.files || [];
      for (const file of files) {
        const name = file.name || file.path || "";
        const slashIdx = name.lastIndexOf("/");
        if (slashIdx > 0) {
          dirs.add(name.substring(0, slashIdx));
        }
      }

      return json({ success: true, data: [...dirs].sort(), source: "imgbed" });
    }

    return json({ success: false, error: "未知 action" }, 400);
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
};

// ─── POST: 上传文件 ────────────────────────────────

export const POST: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const config = getImgBedConfig();
  if (!config.url) {
    return json({ success: false, error: "未配置 ImgBed" }, 500);
  }

  try {
    // 从 multipart/form-data 中提取文件和参数
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const uploadFolder = (formData.get("folder") as string) || config.folder;

    if (!file) {
      return json({ success: false, error: "未选择文件" }, 400);
    }

    // 构建上传 URL
    const params = new URLSearchParams();
    params.set("returnFormat", "full");
    params.set("uploadNameType", "origin");
    if (config.authCode) params.set("authCode", config.authCode);
    if (uploadFolder) params.set("uploadFolder", uploadFolder);

    const uploadUrl = `${config.url}/upload?${params.toString()}`;

    // 转发文件
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const resp = await fetch(uploadUrl, {
      method: "POST",
      body: uploadForm,
    });

    if (!resp.ok) {
      return json(
        { success: false, error: `上传失败 HTTP ${resp.status}` },
        resp.status,
      );
    }

    const data = await resp.json();

    // 提取 URL（兼容多种响应格式）
    let publicUrl = "";
    const result = Array.isArray(data) ? data : data.data || data;
    if (Array.isArray(result) && result.length > 0) {
      publicUrl = result[0].publicUrl || result[0].src || result[0].url || "";
    } else if (result?.publicUrl) {
      publicUrl = result.publicUrl;
    } else if (result?.src) {
      publicUrl = result.src;
    }

    return json({ success: true, url: publicUrl, raw: data });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
};

// ─── DELETE: 删除文件 ──────────────────────────────

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const _authErr = await requireAuth(cookies, getJwtSecret());
  if (_authErr) return _authErr;

  const config = getImgBedConfig();
  if (!config.url || !config.token) {
    return json({ success: false, error: "未配置 ImgBed" }, 500);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const filePath = (body.path as string) || "";
    const fileId = (body.id as string) || "";

    if (!filePath && !fileId) {
      return json({ success: false, error: "缺少文件路径或 ID" }, 400);
    }

    // 如果有 ID，直接用；否则通过 list API 查找
    let deleteId = fileId;
    if (!deleteId && filePath) {
      // 从路径中提取文件名用于搜索
      const filename = filePath.split("/").pop() || filePath;
      const searchParams = new URLSearchParams();
      searchParams.set("search", filename);
      searchParams.set("count", "5");
      const searchDir = filePath.includes("/")
        ? filePath.substring(0, filePath.lastIndexOf("/"))
        : config.folder;
      if (searchDir) searchParams.set("dir", searchDir);

      const listUrl = `${config.url}/api/manage/list?${searchParams.toString()}`;
      const listResp = await fetch(listUrl, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
        },
      });
      const listData = await listResp.json();
      const files = listData?.files || listData?.data?.files || [];

      // 精确匹配文件名
      const match = files.find(
        (f: { name?: string; metadata?: { FileName?: string } }) =>
          (f.name || "").endsWith(filePath) ||
          (f.name || "").split("/").pop() === filename,
      );
      if (match) {
        deleteId = match.id || match._id || match.key || "";
      }
    }

    if (!deleteId) {
      return json(
        {
          success: false,
          error:
            "未找到该文件，可能图床不支持按路径删除。请在图床页面手动操作。",
        },
        404,
      );
    }

    // 尝试删除
    const deleteUrl = `${config.url}/api/manage/delete`;
    const deleteResp = await fetch(deleteUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ id: deleteId }),
    });

    const deleteData = await deleteResp.json().catch(() => ({}));
    if (!deleteResp.ok) {
      return json({
        success: false,
        error: `删除失败 HTTP ${deleteResp.status}: ${JSON.stringify(deleteData).slice(0, 200)}`,
      }, deleteResp.status);
    }

    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
};
