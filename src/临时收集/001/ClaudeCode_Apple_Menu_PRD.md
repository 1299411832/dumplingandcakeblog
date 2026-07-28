# Apple 风格移动端菜单设计 PRD（Claude Code Prompt）

（以下内容可直接复制给 Claude Code）

## 设计目标

打造 Apple 风格（iOS/Apple
Music/Journal）的底部菜单，不使用侧边栏，点击中间按钮后以 Bottom Sheet
展示全部 18 个功能。

## 核心交互

-   点击中间菜单按钮：
    -   底部导航（首页/搜索/后台/返回）全部隐藏。
    -   从底部升起一张约占屏幕 78% 高度的毛玻璃卡片。
    -   页面背景保留并轻微变暗。
-   关闭方式：
    -   仅保留右上角 × 按钮。
    -   点击背景、Android 返回键、ESC 也可关闭。
    -   关闭后菜单下滑消失，底部导航重新显示。

## 整体风格

-   Apple Human Interface Guidelines
-   大量留白、超圆角、毛玻璃、柔和阴影
-   禁止科技风、霓虹、赛博朋克、炫光

## 卡片

-   Bottom Sheet
-   高度：78%
-   圆角：30px
-   毛玻璃：
    -   Light：rgba(255,255,255,.72)
    -   Dark：rgba(35,35,38,.72)
    -   backdrop-filter: blur(35px)

## 顶部个人信息

左侧： - 72px 圆形头像

右侧： - 昵称 - 标签（技术博主 / 生活记录者） - 个性签名

下方四项统计： - 文章 - 评论 - 建站天数 - 访问量

使用 Apple Music 个人主页风格布局。

## 菜单

全部 18 个功能一次展示，不分页、不滚动、不出现"更多"。

建议功能： - 说说 - 动态 - 留言板 - 相册 - 笔记 - 朋友圈 - 书架 - 音乐 -
影视 - 足迹 - 应用展示 - 游戏 - 时间轴 - 更新日志 - 关于我 - 友链 -
后台 - 设置

Grid： - 6 列 × 3 行 - 每项 72×72 - 圆角 20px

## 动画

展开： 1. 底部导航淡出 2. 背景变暗 3. Bottom Sheet translateY + opacity
4. 顶部信息淡入 5. 菜单项依次淡入（15ms）

关闭： - 菜单淡出 - Sheet 下滑 - 导航恢复

## 技术要求

-   Astro
-   Tailwind CSS
-   TypeScript
-   配置驱动菜单
-   CSS Grid
-   GPU 动画（transform/opacity）
-   深浅色主题
-   安全区适配
-   Focus Trap
-   组件拆分：
    -   BottomNav
    -   MenuSheet
    -   ProfileHeader
    -   MenuGrid
