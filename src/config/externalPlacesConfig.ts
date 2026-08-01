export const externalPlacesConfig = {
	enable: true,
	gistId: "3664c0266410b5a28c496733c1ee2c98",
	fileName: "places",
	githubToken: "",

	// CloudFlare ImgBed 图床配置（复用说说的环境变量）
	imageBedUrl: import.meta.env.PUBLIC_IMAGEBED_URL || "",
	imageBedAuthCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
	imageBedFolder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "手机uu",
	// API Token（需要 list 权限，用于上传前查重）
	imageBedApiToken: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
};
