// EdgeOne Pages Cloud Function：GitHub OAuth 入口
// 路由：/oauth → 跳转到 GitHub 授权页
// 约定：Decap/Sveltia 的 github backend 打开 {base_url}/{auth_endpoint}，
//       回调地址为 {base_url}/callback
// 环境变量（EdgeOne 控制台配置，不要提交到仓库）：
//   GITHUB_CLIENT_ID     GitHub OAuth App 的 Client ID
//   GITHUB_CLIENT_SECRET GitHub OAuth App 的 Client Secret
//   SITE_URL             站点域名（必须配置！函数执行时 Host 是平台内部域名，
//                        不能用作回调地址）

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
	// redirect_uri 必须用固定域名（与 GitHub OAuth App 注册的回调地址一致）
	const siteUrl = env.SITE_URL || "https://blog.tsh520.cn";
	const redirectUri = `${siteUrl}/callback`;
	const params = new URLSearchParams({
		client_id: clientId,
		scope,
		redirect_uri: redirectUri,
		state: "sveltia-cms",
	});

	return Response.redirect(
		`https://github.com/login/oauth/authorize?${params.toString()}`,
		302,
	);
}
