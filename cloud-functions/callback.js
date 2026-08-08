// EdgeOne Pages Cloud Function：GitHub OAuth 回调
// 路由：/oauth/callback
// 流程：GitHub 授权后带 code 回调 → 换取 access_token →
//       返回 HTML 把 token 通过 postMessage / hash 两种方式交给 CMS 前端
// 兼容 Decap CMS / Sveltia CMS 的 GitHub backend 登录流程

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const code = url.searchParams.get("code");

	if (!code) {
		return new Response("缺少 code 参数", { status: 400 });
	}

	// code 换 token（GitHub 官方接口）
	const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: env.GITHUB_CLIENT_ID,
			client_secret: env.GITHUB_CLIENT_SECRET,
			code,
		}),
	});
	const data = await tokenRes.json();

	if (!data.access_token) {
		return new Response(
			`<!doctype html><meta charset="utf-8"><title>登录失败</title>` +
				`<p>OAuth 登录失败：${data.error_description || data.error || "未知错误"}</p>`,
			{ status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	}

	const token = data.access_token;
	// 弹窗模式：postMessage 给 opener；直连模式：hash 携带 token
	const html = `<!doctype html><meta charset="utf-8"><title>登录成功</title>
<script>
  const token = ${JSON.stringify(token)};
  if (window.opener) {
    try { window.opener.postMessage('authorization:github:success:' + token, '*'); } catch (e) {}
    setTimeout(function(){ window.close(); }, 500);
  } else {
    location.replace('/admin/#access_token=' + encodeURIComponent(token));
  }
</script>`;
	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}
