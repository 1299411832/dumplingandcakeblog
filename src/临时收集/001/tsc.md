你现在在本地仓库 `E:\GithubProgect\MyRunProject\dumplingandcakeblog` 里工作，先阅读仓库根目录的 `AGENTS.md`，严格按里面的规范来。不要动 git，不要 `git add/commit/reset/revert`。

任务目标：
把本地文章阅读页 `http://localhost:4321/posts/%E6%8A%80%E6%9C%AF%E5%88%86%E4%BA%AB/blog-waline-backup/` 的顶部区域，改成参考页 `https://tblog.mmzhiku.xyz/posts/others/others-blog-firefly-mod/` 的样式气质，但不要使用封面图片。

参考范围：
- 参考仓库：`E:\GithubProgect\OtherRunProject\my-blog`
- 重点参考它的文章详情页结构和样式
- 本地主要修改文件大概率是：
  - `src/pages/posts/[...slug].astro`
  - `src/components/layout/PostMeta.astro`
  - `src/styles/components/post-page.css`
  - 如有需要，新建 `src/styles/components/post-hero.css` 并在 `src/styles/main.css` 中引入

具体要求：
1. 只改文章详情页顶部区域，不要改首页、列表页、侧栏、底部、相关文章、上一篇下一篇、评论区。
2. 顶部结构改成参考页那种顺序：
   - 居中标题
   - 一行轻量 meta 信息
   - 简介卡/说明卡
   - 然后直接进入正文
3. 不要显示顶部封面图，不要渲染 `CoverImage`，不要 `post-cover` 图片块。
4. 如果当前顶部有 AI 摘要卡，改成更像参考页的纯文本简介卡包裹。
5. meta 行尽量保留这些信息：
   - 发布日期
   - 分类
   - 标签
   - 字数 / 阅读时长
   - 访问量 / 阅读量
   - 分享按钮（参考他的项目实现）
6. 视觉上要更接近参考页：
   - 标题更克制、更居中
   - 元信息更紧凑
   - 简介卡更像浅边框的独立区域
   - 整体留白和层级要自然
7. 保留现有文章正文渲染、KaTeX、评论、上下篇、相关文章等功能，不要误删。
8. 样式尽量走现有 CSS 体系，不要把大段样式塞进页面文件里。能放 `src/styles/components/post-hero.css` 就放那里，再在 `main.css` 里引入。
9. 尽量复用现有组件和设计令牌，不要硬编码颜色，不要新增不必要的 `!important`。
10. 做完后检查本地页面在桌面和移动端的效果，确认没有破坏其他文章页。

如果需要先出方案，先简短说明拟改哪些文件、会怎么改，等确认后再动手。

做之前先看他的项目样式，上面最好做成一样的，用头脑风暴思考。