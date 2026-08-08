// EdgeOne Pages Cloud Function：高德地理编码代理
// 路由：/api/geocode-proxy?address=xxx
// 作用：前端只传地址，高德 key 留在服务端（避免 key 暴露与 CORS 问题）
// 环境变量（EdgeOne 控制台配置）：
//   AMAP_KEY  高德开放平台 Web 服务 key
// 响应：{ success: true, lat: 34.x, lng: 113.x } 或 { success: false, error: "..." }

export async function onRequestGet(context) {
	const { env, request } = context;
	const url = new URL(request.url);
	const address = url.searchParams.get("address");

	if (!address) {
		return Response.json({ success: false, error: "缺少 address 参数" }, { status: 400 });
	}
	if (!env.AMAP_KEY) {
		return Response.json({ success: false, error: "服务端未配置 AMAP_KEY" }, { status: 500 });
	}

	try {
		const res = await fetch(
			"https://restapi.amap.com/v3/geocode/geo?key=" +
				encodeURIComponent(env.AMAP_KEY) +
				"&address=" +
				encodeURIComponent(address),
		);
		const data = await res.json();

		if (data.status === "1" && data.geocodes && data.geocodes.length > 0) {
			// location 格式："lng,lat"
			const parts = data.geocodes[0].location.split(",");
			return Response.json({
				success: true,
				lat: Number(parts[1]),
				lng: Number(parts[0]),
				formattedAddress: data.geocodes[0].formatted_address || "",
			});
		}
		return Response.json({ success: false, error: "未找到该地址" });
	} catch (e) {
		return Response.json({ success: false, error: String(e && e.message || e) }, { status: 500 });
	}
}
