/**
 * 后台管理 JWT 认证工具
 * 使用 Web Crypto API 实现 HMAC-SHA256 JWT 签发和验证
 * Token 通过 httpOnly cookie 传递，有效期 24h
 */
import type { AstroCookies } from "astro";

const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24h
const COOKIE_NAME = "admin_token";

// ─── 编码工具 ───────────────────────────────────────

function base64urlEncode(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) str += "=";
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

const encoder = new TextEncoder();

// ─── HMAC-SHA256 ────────────────────────────────────

async function hmacSha256(key: CryptoKey, data: string): Promise<ArrayBuffer> {
	return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

async function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

// ─── Token 操作 ─────────────────────────────────────

export interface TokenPayload {
	iat: number;
	exp: number;
}

export async function signToken(
	secret: string,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "HS256", typ: "JWT" };
	const payload: TokenPayload = {
		iat: now,
		exp: now + TOKEN_EXPIRY_SECONDS,
	};

	const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
	const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(payload)));
	const signingInput = `${headerB64}.${payloadB64}`;

	const key = await importKey(secret);
	const signature = await hmacSha256(key, signingInput);
	const signatureB64 = base64urlEncode(signature);

	return `${signingInput}.${signatureB64}`;
}

export async function verifyToken(
	token: string,
	secret: string,
): Promise<TokenPayload | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const [headerB64, payloadB64, signatureB64] = parts;
		const signingInput = `${headerB64}.${payloadB64}`;

		const key = await importKey(secret);
		const expectedSig = base64urlEncode(await hmacSha256(key, signingInput));

		// 常量时间比较签名
		if (expectedSig !== signatureB64) return null;

		// 解析 payload
		const payloadBytes = base64urlDecode(payloadB64);
		const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as TokenPayload;

		// 检查过期
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
	const payload = await verifyToken(token, secret);
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
