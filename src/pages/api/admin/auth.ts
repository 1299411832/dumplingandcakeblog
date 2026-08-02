/**
 * POST /api/admin/auth — 登录
 * DELETE /api/admin/auth — 登出
 */
import type { APIRoute } from "astro";
export const prerender = false;

import {
	clearAuthCookie,
	getJwtSecret,
	setAuthCookie,
	signToken,
	verifyToken,
} from "@/utils/admin/auth";

async function sha256(str: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(str),
	);
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

export const GET: APIRoute = async ({ cookies }) => {
	const { authed } = await getAuthFromCookies(cookies, getJwtSecret());
	return json({ success: true, authed });
};

export const POST: APIRoute = async ({ request, cookies }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as {
			password?: string;
		};
		const password = body.password || "";

		if (!password) {
			return json({ success: false, error: "请输入密码" }, 400);
		}

		const expectedHash = import.meta.env.PUBLIC_ADMIN_PASSWORD_HASH || "";
		if (!expectedHash) {
			return json({ success: false, error: "服务端未配置密码哈希" }, 500);
		}

		const inputHash = await sha256(password);
		if (inputHash !== expectedHash) {
			return json({ success: false, error: "密码错误" }, 401);
		}

		const secret = getJwtSecret();
		if (!secret) {
			return json({ success: false, error: "服务端未配置 JWT Secret" }, 500);
		}

		const token = await signToken(secret);
		setAuthCookie(cookies, token);

		return json({ success: true });
	} catch (e) {
		return json({ success: false, error: String(e) }, 500);
	}
};

export const DELETE: APIRoute = async ({ cookies }) => {
	clearAuthCookie(cookies);
	return json({ success: true });
};
