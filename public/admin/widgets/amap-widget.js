// 高德坐标搜索 widget（amap-geocode）
// 功能：输入地址 → 调高德地理编码 API → 自动回填 lat/lng 两个字段
// key 从 window.ADMIN_CONFIG.amapKey 读取（见 admin-config.js）
// 用法（config.yml，fields 里声明 lat/lng 两个 number 字段）：
//   - { label: 坐标搜索, name: amap-coords, widget: amap-geocode, fields: [{name: lat}, {name: lng}] }
// 保存时 preSave 钩子会把 amap-coords 展开为顶层 lat/lng 并删除辅助键
(function () {
	const CMS = window.CMS || window.SveltiaCMS;
	if (!CMS) {
		console.error("[amap-widget] CMS 未加载");
		return;
	}
	if (!window.React) {
		console.error("[amap-widget] React 未加载");
		return;
	}
	const { useState } = window.React;

	const AmapWidget = function (props) {
		const { value, onChange } = props; // value: { lat, lng }
		const [address, setAddress] = useState("");
		const [loading, setLoading] = useState(false);
		const [error, setError] = useState("");
		const cfg = window.ADMIN_CONFIG || {};

		// 地理编码搜索（走服务端代理，高德 key 在 EdgeOne 环境变量）
		const search = function () {
			if (!address.trim()) {
				setError("请先输入地址");
				return;
			}
			setLoading(true);
			setError("");
			fetch(cfg.geocodeUrl + "?address=" + encodeURIComponent(address.trim()))
				.then(function (res) {
					return res.json();
				})
				.then(function (data) {
					if (data && data.success) {
						onChange({ lat: data.lat, lng: data.lng });
					} else {
						setError((data && data.error) || "未找到该地址，请换个关键词试试");
					}
				})
				.catch(function (e) {
					setError("查询失败：" + e.message);
				})
				.finally(function () {
					setLoading(false);
				});
		};

		const styles = {
			row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
			input: { flex: "1", minWidth: "180px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" },
			btn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer", fontSize: "13px" },
			text: { fontSize: "12px", color: "#888" },
			error: { color: "#d33", fontSize: "12px" },
		};

		return window.React.createElement(
			"div",
			{ style: { display: "flex", flexDirection: "column", gap: "6px" } },
			window.React.createElement(
				"div",
				{ style: styles.row },
				window.React.createElement("input", {
					type: "text",
					style: styles.input,
					placeholder: "输入地址或城市，如：郑州",
					value: address,
					onChange: function (e) {
						setAddress(e.target.value);
					},
					onKeyDown: function (e) {
						if (e.key === "Enter") search();
					},
				}),
				window.React.createElement(
					"button",
					{ type: "button", style: styles.btn, disabled: loading, onClick: search },
					loading ? "查询中…" : "📍 搜索坐标",
				),
			),
			value && typeof value.lat === "number"
				? window.React.createElement(
						"span",
						{ style: styles.text },
						"当前坐标：纬度 " + value.lat + "，经度 " + value.lng + "（保存后写入 lat/lng 字段）",
					)
				: null,
			error ? window.React.createElement("span", { style: styles.error }, error) : null,
		);
	};

	// 注册 widget
	CMS.registerWidget("amap-geocode", AmapWidget);

	// preSave 钩子：把 amap-coords 展开为顶层 lat/lng 并删除辅助键
	// （zod schema 要求 lat/lng 是顶层字段，不能留嵌套的 amap-coords）
	// Decap 的事件监听器格式：{ 事件名: 回调 }（与 Sveltia 的 { name, handler } 不同）
	CMS.registerEventListener({
		preSave: function (args) {
			const entry = args && args.entry;
			const coords = entry && entry.data && entry.data["amap-coords"];
			if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
				entry.data.lat = coords.lat;
				entry.data.lng = coords.lng;
				delete entry.data["amap-coords"];
			}
		},
	});

	console.log("[amap-widget] 注册完成");
})();
