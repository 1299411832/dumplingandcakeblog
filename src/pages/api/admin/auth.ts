/**
 * /api/admin/auth — 登录/登出（完全自包含，零外部依赖）
 * 在 Vercel serverless 环境中不依赖任何外部模块导入
 */
import type { APIRoute } from "astro";
export const prerender = false;

import { createHash, createHmac } from "node:crypto";

const COOKIE_NAME = "admin_token";
const TOKEN_EXPIRY = 86400; // 24h

// ─── JSON 响应 ──────────────────────────────────────

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ─── SHA-256 ────────────────────────────────────────

function sha256(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

// ─── base64url ──────────────────────────────────────

function b64encode(str: string): string {
  return Buffer.from(str).toString("base64url");
}
function b64decode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

// ─── JWT ────────────────────────────────────────────

function jwtSign(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64encode(JSON.stringify({ iat: now, exp: now + TOKEN_EXPIRY }));
  const input = `${header}.${payload}`;
  const sig = Buffer.from(createHmac("sha256", secret).update(input).digest("hex"), "hex").toString("base64url");
  return `${input}.${sig}`;
}

function jwtVerify(token: string, secret: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const input = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(createHmac("sha256", secret).update(input).digest("hex"), "hex").toString("base64url");
    if (parts[2] !== expected) return false;
    const payload = JSON.parse(b64decode(parts[1]));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// ─── Cookie ─────────────────────────────────────────

function setCookie(cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void }, token: string) {
  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_EXPIRY,
  });
}
function clearCookie(cookies: { delete: (name: string, opts: Record<string, unknown>) => void }) {
  cookies.delete(COOKIE_NAME, { path: "/" });
}

// ─── 路由 ───────────────────────────────────────────

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get(COOKIE_NAME)?.value;
  const secret = import.meta.env.ADMIN_JWT_SECRET || "";
  const authed = !!(token && secret && jwtVerify(token, secret));
  return json({ success: true, authed });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const password = body.password || "";

    if (!password) return json({ success: false, error: "请输入密码" }, 400);

    const expectedHash = import.meta.env.PUBLIC_ADMIN_PASSWORD_HASH || "";
    if (!expectedHash) return json({ success: false, error: "未配置密码哈希" }, 500);
    if (sha256(password) !== expectedHash) return json({ success: false, error: "密码错误" }, 401);

    const secret = import.meta.env.ADMIN_JWT_SECRET || "";
    if (!secret) return json({ success: false, error: "未配置 JWT Secret" }, 500);

    const token = jwtSign(secret);
    setCookie(cookies, token);

    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
};

export const DELETE: APIRoute = async ({ cookies }) => {
  clearCookie(cookies);
  return json({ success: true });
};
