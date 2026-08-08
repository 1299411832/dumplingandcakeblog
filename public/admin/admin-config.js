// 博客后台配置（无敏感凭证）
// 注意：GitHub Client Secret、图床令牌、高德 key 等敏感信息
//       一律配置在 EdgeOne 控制台环境变量，由云函数代理使用，不进仓库！
// GitHub 认证走 PKCE（app_id 配置在 config.yml 的 backend 里）
window.ADMIN_CONFIG = {
	// 图床上传代理（cloud-functions/api/upload-proxy.js，凭证在服务端）
	imgbedUploadUrl: "/api/upload-proxy",

	// 高德地理编码代理（cloud-functions/api/geocode-proxy.js，key 在服务端）
	geocodeUrl: "/api/geocode-proxy",
};
