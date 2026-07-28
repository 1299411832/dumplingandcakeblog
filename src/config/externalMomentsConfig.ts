// 外部说说数据源配置（基于 GitHub Gist，完全免费）
// 数据存储在 GitHub Gist 中，通过 GitHub API 读写
// 添加新说说不会修改仓库中的任何代码

export const externalMomentsConfig = {
	// 是否启用外部说说数据源
	enable: true,

	// GitHub Gist ID（创建 Gist 后从 URL 中获取）
	gistId: "562ca26ed50f406e0814cd5fd06866d3",

	// Gist 中的文件名
	fileName: "moments.json",

	// 默认作者信息
	defaultAuthor: "团子",
	defaultAvatar: "/assets/ziyuan/tx.webp",

	// 后台登录密码的 SHA-256 哈希（从环境变量读取）
	// 生成方式：echo -n "你的密码" | sha256sum
	adminPasswordHash: import.meta.env.PUBLIC_ADMIN_PASSWORD_HASH || "",

	// GitHub Token（优先从环境变量 GITHUB_TOKEN 读取）
	githubToken: process.env.GITHUB_TOKEN || "",

	// CloudFlare ImgBed 图床配置（用于说说图片上传）
	// 图床 API 地址，不带末尾斜杠
	imageBedUrl: import.meta.env.PUBLIC_IMAGEBED_URL || "",
	// 上传认证码
	imageBedAuthCode: import.meta.env.PUBLIC_IMAGEBED_AUTH_CODE || "",
	// 上传目录（相对路径，如 "moments"），留空则上传到根目录
	imageBedFolder: import.meta.env.PUBLIC_IMAGEBED_FOLDER || "手机uu",
	// API Token（需要 list 权限，用于上传前查重）
	imageBedApiToken: import.meta.env.PUBLIC_IMAGEBED_API_TOKEN || "",
};
