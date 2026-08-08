// 图床直传 widget（imgbed）
// 功能：选择本地图片 → 上传到 CloudFlare-ImgBed 图床 → 自动把返回的 URL 填入字段
// 凭证从 window.ADMIN_CONFIG 读取（见 admin-config.js）
// 用法（config.yml）：field: { name: xxx, widget: imgbed }
(function () {
	const CMS = window.CMS || window.SveltiaCMS;
	if (!CMS) {
		console.error("[imgbed-widget] CMS 未加载");
		return;
	}
	if (!window.React) {
		console.error("[imgbed-widget] React 未加载");
		return;
	}
	const { useState, useRef } = window.React;

	const ImgBedWidget = function (props) {
		const { value, onChange } = props;
		const [uploading, setUploading] = useState(false);
		const [error, setError] = useState("");
		const fileInputRef = useRef(null);
		const cfg = window.ADMIN_CONFIG || {};

		// 上传本地图片：走服务端代理（凭证在 EdgeOne 环境变量，前端不接触）
		const upload = function (file) {
			const form = new FormData();
			form.append("file", file);
			setUploading(true);
			setError("");
			fetch(cfg.imgbedUploadUrl, { method: "POST", body: form })
				.then(function (res) {
					return res.json();
				})
				.then(function (data) {
					if (!data || !data.success) {
						throw new Error((data && data.error) || "上传失败");
					}
					onChange(data.url); // 代理已返回完整图床 URL
				})
				.catch(function (e) {
					setError("上传失败：" + e.message);
				})
				.finally(function () {
					setUploading(false);
					if (fileInputRef.current) fileInputRef.current.value = "";
				});
		};

		// 简单样式
		const styles = {
			row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
			btn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer", fontSize: "13px" },
			input: { flex: "1", minWidth: "180px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" },
			img: { maxWidth: "120px", maxHeight: "80px", borderRadius: "6px", objectFit: "cover" },
			error: { color: "#d33", fontSize: "12px" },
		};

		return window.React.createElement(
			"div",
			{ style: { display: "flex", flexDirection: "column", gap: "6px" } },
			// 第一行：上传按钮 + URL 输入
			window.React.createElement(
				"div",
				{ style: styles.row },
				window.React.createElement("input", {
					ref: fileInputRef,
					type: "file",
					accept: "image/*",
					style: { display: "none" },
					onChange: function (e) {
						if (e.target.files && e.target.files[0]) upload(e.target.files[0]);
					},
				}),
				window.React.createElement(
					"button",
					{
						type: "button",
						style: styles.btn,
						disabled: uploading,
						onClick: function () {
							if (fileInputRef.current) fileInputRef.current.click();
						},
					},
					uploading ? "上传中…" : "📤 上传到图床",
				),
				window.React.createElement("input", {
					type: "url",
					style: styles.input,
					placeholder: "图片 URL（可直接粘贴）",
					value: value || "",
					onChange: function (e) {
						onChange(e.target.value);
					},
				}),
			),
			// 第二行：预览 + 错误
			window.React.createElement(
				"div",
				{ style: styles.row },
				value ? window.React.createElement("img", { src: value, alt: "预览", style: styles.img }) : null,
				error ? window.React.createElement("span", { style: styles.error }, error) : null,
			),
		);
	};

	CMS.registerWidget("imgbed", ImgBedWidget);
	console.log("[imgbed-widget] 注册完成");
})();
