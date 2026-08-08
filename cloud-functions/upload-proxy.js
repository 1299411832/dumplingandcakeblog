// EdgeOne Pages Cloud Function：图床上传代理
// 路由：/api/upload-proxy
// 作用：前端把图片 POST 到这里，函数携带服务端凭证转发到 CloudFlare-ImgBed 图床
//       （凭证不暴露在前端；同时绕开图床 CORS 限制）
// 环境变量（EdgeOne 控制台配置）：
//   IMAGEBED_URL        图床域名，如 https://img.tsh520.cn
//   IMAGEBED_AUTH_CODE  图床上传令牌
//   IMAGEBED_API_TOKEN  图床 API Token（可选）
//   IMAGEBED_FOLDER     上传目录（可选）
// 响应：{ success: true, url: "完整图片地址" } 或 { success: false, error: "..." }

export async function onRequestPost(context) {
	const { env, request } = context;
	const baseUrl = env.IMAGEBED_URL || "https://img.tsh520.cn";

	try {
		// 透传前端表单（含 file 字段）
		const form = await request.formData();

		// 附加服务端凭证
		if (env.IMAGEBED_AUTH_CODE) form.append("authCode", env.IMAGEBED_AUTH_CODE);
		if (env.IMAGEBED_FOLDER) form.append("folder", env.IMAGEBED_FOLDER);

		const headers = {};
		if (env.IMAGEBED_API_TOKEN) {
			headers["Authorization"] = "Bearer " + env.IMAGEBED_API_TOKEN;
		}

		const res = await fetch(baseUrl + "/api/upload", {
			method: "POST",
			headers,
			body: form,
		});

		const data = await res.json();
		// ImgBed 响应：{ success: true, data: [{ src: "..." }] }
		const src = (data && data.data && data.data[0] && data.data[0].src) || (data && data.src);
		if (!src) {
			return Response.json({ success: false, error: "图床响应异常: " + JSON.stringify(data) }, { status: 502 });
		}
		// src 可能是相对路径，补全图床域名
		const full = src.startsWith("http") ? src : baseUrl + src;
		return Response.json({ success: true, url: full });
	} catch (e) {
		return Response.json({ success: false, error: String(e && e.message || e) }, { status: 500 });
	}
}
