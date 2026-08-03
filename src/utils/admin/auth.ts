/**
 * 后台管理 JWT 认证工具
 * 使用 Node.js crypto 模块实现 HMAC-SHA256 JWT 签发和验证
 * Token 通过 httpOnly cookie 传递，有效期 24h
 */
import type { AstroCookies } from "astro";
import { createHmac } from "node:crypto";

const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24h
const COOKIE_NAME = "admin_token";

// ─── 编码工具 ───────────────────────────────────────

function base64urlEncode(str: string): string {
	return Buffer.from(str).toString("base64url");
}

function base64urlDecode(str: string): string {
	return Buffer.from(str, "base64url").toString("utf-8");
}

const encoder = new TextEncoder();

// ─── HMAC-SHA256（Node.js 原生）────────────────────

function hmacSha256Hex(secret: string, data: string): string {
	return createHmac("sha256", secret).update(data).digest("hex");
}

// ─── Token 操作 ─────────────────────────────────────

export interface TokenPayload {
	iat: number;
	exp: number;
}

export function signToken(secret: string): string {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "HS256", typ: "JWT" };
	const payload: TokenPayload = {
		iat: now,
		exp: now + TOKEN_EXPIRY_SECONDS,
	};

	const headerB64 = base64urlEncode(JSON.stringify(header));
	const payloadB64 = base64urlEncode(JSON.stringify(payload));
	const signingInput = `${headerB64}.${payloadB64}`;
	const sigHex = hmacSha256Hex(secret, signingInput);
	const signatureB64 = Buffer.from(sigHex, "hex").toString("base64url");

	return `${signingInput}.${signatureB64}`;
}

export function verifyToken(
	token: string,
	secret: string,
): TokenPayload | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const [headerB64, payloadB64, signatureB64] = parts;
		const signingInput = `${headerB64}.${payloadB64}`;
		const sigHex = hmacSha256Hex(secret, signingInput);
		const expectedB64 = Buffer.from(sigHex, "hex").toString("base64url");

		if (signatureB64 !== expectedB64) return null;

		const payload = JSON.parse(base64urlDecode(payloadB64)) as TokenPayload;
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp < now) return null;

		return payload;
	} catch {
		return null;
	}
}

// ─── Cookie 操作（Astro APIRoute context）────────────

export function setAuthCookie(cookies: AstroCookies, token: string): void {
	cookies.set(COOKIE_NAME, token, {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: "lax",
		path: "/",
		maxAge: TOKEN_EXPIRY_SECONDS,
	});
}

export function clearAuthCookie(cookies: AstroCookies): void {
	cookies.delete(COOKIE_NAME, { path: "/" });
}

export async function getAuthFromCookies(
	cookies: AstroCookies,
	secret?: string,
): Promise<{ authed: boolean }> {
	if (!secret) return { authed: false };
	const token = cookies.get(COOKIE_NAME)?.value;
	if (!token) return { authed: false };
	const payload = verifyToken(token, secret);
	return { authed: payload !== null };
}

export async function requireAuth(
	cookies: AstroCookies,
	secret?: string,
): Promise<Response | null> {
	const { authed } = await getAuthFromCookies(cookies, secret);
	if (!authed) {
		return new Response(JSON.stringify({ success: false, error: "未登录" }), {
			status: 401,
			headers: { "Content-Type": "application/json; charset=utf-8" },
		});
	}
	return null;
}

/** 从环境变量获取 JWT secret */
export function getJwtSecret(): string {
	return import.meta.env.ADMIN_JWT_SECRET || "";
}
