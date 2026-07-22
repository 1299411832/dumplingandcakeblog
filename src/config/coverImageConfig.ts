import type { CoverImageConfig } from "../types/config";

/**
 * 文章封面图配置
 *
 * enableInPost - 是否在文章详情页显示封面图
 *
 * 随机封面图使用说明：
 * 1. 在文章的 Frontmatter 中添加 image: "api" 即可使用随机图功能
 * 2. 系统会依次尝试所有配置的 API，全部失败后使用备用图片
 *
 * // 文章 Frontmatter 示例：
 * ---
 * title: 文章标题
 * image: "api"
 * ---
 */
export const coverImageConfig: CoverImageConfig = {
	// 是否在文章详情页显示封面图
	enableInPost: false,

	randomCoverImage: {
		// 随机封面图功能开关
		enable: true,
		// 封面图API列表
		apis: [
			"/assets/images/sjtapi/1.webp",
			"/assets/images/sjtapi/2.webp",
			"/assets/images/sjtapi/3.webp",
			"/assets/images/sjtapi/4.webp",
			"/assets/images/sjtapi/5.webp",
			"/assets/images/sjtapi/6.webp",
			"/assets/images/sjtapi/7.png",
			"/assets/images/sjtapi/8.webp",
			"/assets/images/sjtapi/9.png",
			"/assets/images/sjtapi/10.webp",
			"/assets/images/sjtapi/11.webp",
			"/assets/images/sjtapi/12.webp",
			"/assets/images/sjtapi/13.webp",
			"/assets/images/sjtapi/14.webp",
			"/assets/images/sjtapi/15.png",
			"/assets/images/sjtapi/16.webp",
			"/assets/images/sjtapi/17.webp",
			"/assets/images/sjtapi/18.webp",
			"/assets/images/sjtapi/19.webp",
			"/assets/images/sjtapi/20.webp",
			"/assets/images/sjtapi/21.webp",
			"/assets/images/sjtapi/22.webp",
			"/assets/images/sjtapi/23.webp",
			"/assets/images/sjtapi/24.webp",
			"/assets/images/sjtapi/25.png",
			"/assets/images/sjtapi/26.webp",
			"/assets/images/sjtapi/27.png",
			"/assets/images/sjtapi/28.png",
			"/assets/images/sjtapi/29.webp",
			"/assets/images/sjtapi/30.webp",
			"/assets/images/sjtapi/31.webp",
			"/assets/images/sjtapi/32.webp",
			"/assets/images/sjtapi/33.png",
			"/assets/images/sjtapi/34.webp",
			"/assets/images/sjtapi/35.webp",
			"/assets/images/sjtapi/36.webp",
			"/assets/images/sjtapi/37.webp",
			"/assets/images/sjtapi/38.png",
			"/assets/images/sjtapi/39.png",
			"/assets/images/sjtapi/40.webp",
			"/assets/images/sjtapi/41.webp",
			"/assets/images/sjtapi/42.webp",
			"/assets/images/sjtapi/43.webp",
			"/assets/images/sjtapi/44.webp",
			"/assets/images/sjtapi/45.webp",
			"/assets/images/sjtapi/46.webp",
			"/assets/images/sjtapi/47.webp",
			"/assets/images/sjtapi/48.webp",
			"/assets/images/sjtapi/49.png",
			"/assets/images/sjtapi/50.webp",
			"/assets/images/sjtapi/51.webp",
			"/assets/images/sjtapi/52.png",
			"/assets/images/sjtapi/53.png",
			"/assets/images/sjtapi/54.png",
			"/assets/images/sjtapi/55.png",
			"/assets/images/sjtapi/56.webp",
			"/assets/images/sjtapi/57.webp",
			"/assets/images/sjtapi/58.webp",
			"/assets/images/sjtapi/59.webp",
			"/assets/images/sjtapi/60.webp",
			"/assets/images/sjtapi/61.webp",
			"/assets/images/sjtapi/62.webp",
		],
		// API失败时的回退图片路径（相对于src目录或以/开头的public目录路径）
		fallback: "assets/images/cover.avif",
		// 是否显示加载动画
		showLoading: false,
	},
};
