// 足迹管理配置（图床设置保留）
// 所有足迹数据通过 /api/admin/places 直接写入 Content Collection

export const externalPlacesConfig = {
	enable: true,

	// 图床配置（复用环境变量）
	imageBedUrl: import.meta.env.PUBLIC_IMAGEBED_URL || "",
	imageBedAuthCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
	imageBedFolder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "手机uu",
	imageBedApiToken: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
};
