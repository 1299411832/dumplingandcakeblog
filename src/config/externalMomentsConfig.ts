// 说说管理配置（图床设置保留，其他已迁移到 API）
// 所有说说数据通过 /api/admin/moments 直接写入 Content Collection

export const externalMomentsConfig = {
	// 是否启用外部说说数据源（已废弃，保留兼容）
	enable: true,

	// GitHub Gist ID（已废弃）
	gistId: "",
	fileName: "moments.json",

	// 默认作者信息
	defaultAuthor: "团子",
	defaultAvatar: "/assets/ziyuan/tx.webp",

	// CloudFlare ImgBed 图床配置（用于说说图片上传）
	imageBedUrl: import.meta.env.PUBLIC_IMAGEBED_URL || "",
	imageBedAuthCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
	imageBedFolder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "手机uu",
	imageBedApiToken: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
};
