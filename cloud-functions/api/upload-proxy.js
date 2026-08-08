// EdgeOne Pages Cloud Function：图床上传代理
// 路由：/api/upload-proxy
// 作用：前端把图片 POST 到这里，函数携带服务端凭证转发到 CloudFlare-ImgBed 图床
//       （凭证不暴露在前端；同时绕开图床 CORS 限制）
// 环境变量（EdgeOne 控制台配置）：
//   IMAGEBED_URL         图床域名，如 https://img.tsh520.cn
//   IMAGEBED_AUTH_CODE   图床上传认证码
//   IMAGEBED_FOLDER      上传目录（可选），如 手机uu
//   IMAGEBED_CHANNEL     上传渠道（可选），默认不传（图床默认渠道）
// 图床 API 说明（CloudFlare-ImgBed）：
//   POST /upload?authCode=xxx&uploadFolder=yyy&returnFormat=full
//   FormData: file
//   响应：[{ "src": "https://img.tsh520.cn/file/..." }]
// 响应：{ success: true, url: "完整图片地址" } 或 { success: false, error: "..." }

export async function onRequestPost(context) {
	const { env, request } = context;
	const baseUrl = env.IMAGEBED_URL || "https://img.tsh520.cn";

	try {
		// 透传前端表单（含 file 字段）
		const form = await request.formData();

		// 凭证与参数走 query（图床 API 约定）
		const params = new URLSearchParams({ returnFormat: "full" });
		if (env.IMAGEBED_AUTH_CODE) params.set("authCode", env.IMAGEBED_AUTH_CODE);
		if (env.IMAGEBED_FOLDER) params.set("uploadFolder", env.IMAGEBED_FOLDER);
		if (env.IMAGEBED_CHANNEL) params.set("uploadChannel", env.IMAGEBED_CHANNEL);

		const res = await fetch(baseUrl + "/upload?" + params.toString(), {
			method: "POST",
			body: form,
		});

		const text = await res.text();
		let data;
		try {
			data = JSON.parse(text);
		} catch {
			return Response.json(
				{ success: false, error: "图床响应不是 JSON: " + text.slice(0, 200) },
				{ status: 502 },
			);
		}

		// 图床响应：数组 [{ src, publicUrl }]
		const item = Array.isArray(data) ? data[0] : null;
		const src = (item && (item.src || item.publicUrl)) || "";
		if (!src) {
			return Response.json({ success: false, error: "图床响应异常: " + text.slice(0, 200) }, { status: 502 });
		}
		const full = src.startsWith("http") ? src : baseUrl + src;
		return Response.json({ success: true, url: full });
	} catch (e) {
		return Response.json(
			{ success: false, error: String((e && e.message) || e) },
			{ status: 500 },
		);
	}
}
