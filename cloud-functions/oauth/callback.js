// EdgeOne Pages Cloud Function：GitHub OAuth 回调
// 路由：/oauth/callback
// 协议（Sveltia CMS 的 popup 认证）：
//   1. 本页加载后先向 opener 发 "authorizing:github"
//   2. 监听 opener 的确认消息（同值回发）
//   3. 向 opener 发 "authorization:github:success:{json}"（含 token）
//   4. 兼容 Decap 风格：1 秒后兜底直接发送 success
// 环境变量：
//   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SITE_URL

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const code = url.searchParams.get("code");

	if (!code) {
		return new Response("缺少 code 参数", { status: 400 });
	}

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
		const errorHtml = `<!doctype html><meta charset="utf-8"><title>登录失败</title>
<p>OAuth 登录失败：${(data.error_description || data.error || "未知错误").replace(/</g, "&lt;")}</p>`;
		return new Response(errorHtml, {
			status: 400,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}

	const token = data.access_token;
	// 与 Sveltia 源码 dY() 一致的 popup 握手协议
	const html = `<!doctype html><meta charset="utf-8"><title>登录成功</title>
<script>
(function() {
  var provider = "github";
  var token = ${JSON.stringify(token)};
  var sent = false;
  function sendSuccess(origin) {
    if (sent) return;
    sent = true;
    window.opener.postMessage(
      "authorization:" + provider + ":success:" +
        JSON.stringify({ provider: provider, token: token }),
      origin || window.location.origin
    );
    setTimeout(function () { window.close(); }, 500);
  }
  if (!window.opener) {
    location.replace("/admin/#access_token=" + encodeURIComponent(token));
    return;
  }
  // 1. 通知 opener 开始授权
  window.opener.postMessage("authorizing:" + provider, window.location.origin);
  // 2. 监听 opener 的确认（opener 回发同值消息，origin 即 opener 的 origin）
  window.addEventListener("message", function (e) {
    if (e.data === "authorizing:" + provider) sendSuccess(e.origin);
  });
  // 3. 兜底：兼容 Decap 风格的 opener（不握手直接收 success）
  setTimeout(function () { sendSuccess(); }, 1000);
})();
</script>`;
	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}
