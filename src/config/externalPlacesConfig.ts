// 足迹管理配置（图床设置保留）
// 足迹数据由后台页面读取 /data/places.json，写入通过 GitHub API

export const externalPlacesConfig = {
	enable: true,

	// 图床配置（复用环境变量）
	imageBedUrl: import.meta.env.PUBLIC_IMAGEBED_URL || "",
	imageBedAuthCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
	imageBedFolder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "手机uu",
	imageBedApiToken: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
};
