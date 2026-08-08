// EdgeOne Pages Cloud Function：GitHub OAuth 入口
// 路由：/oauth
// 协议：Sveltia/Decap 的 GitHub 认证（Netlify 风格）：
//       popup 打开 {base_url}/{auth_endpoint}?provider=github&site_id=xxx&scope=xxx
//       本函数收到后 302 跳 GitHub 授权页
// 环境变量（EdgeOne 控制台配置）：
//   GITHUB_CLIENT_ID     GitHub OAuth App 的 Client ID
//   GITHUB_CLIENT_SECRET GitHub OAuth App 的 Client Secret
//   SITE_URL             站点域名（默认 https://blog.tsh520.cn）
// GitHub OAuth App 的 Authorization callback URL：
//   https://blog.tsh520.cn/oauth/callback

export function onRequestGet(context) {
	const { env, request } = context;
	const clientId = env.GITHUB_CLIENT_ID;
	if (!clientId) {
		return new Response("OAuth 未配置：缺少 GITHUB_CLIENT_ID 环境变量", {
			status: 500,
		});
	}

	const url = new URL(request.url);
	const scope = url.searchParams.get("scope") || "repo";
	const siteUrl = env.SITE_URL || "https://blog.tsh520.cn";
	const redirectUri = `${siteUrl}/oauth/callback`;

	const params = new URLSearchParams({
		client_id: clientId,
		scope,
		redirect_uri: redirectUri,
		state: "decap-cms",
	});

	return Response.redirect(
		`https://github.com/login/oauth/authorize?${params.toString()}`,
		302,
	);
}
