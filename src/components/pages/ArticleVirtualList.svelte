<script lang="ts">
import { onMount } from "svelte";

type ArticleListView = "list" | "grid";

type ArticleListTag = {
	name: string;
	url: string;
};

export type ArticleListPost = {
	id: string;
	title: string;
	url: string;
	publishedIso: string;
	publishedText: string;
	category: string;
	categoryUrl: string;
	tags: ArticleListTag[];
	description: string;
	imageUrl: string;
	imageApiUrls: string[];
	pinned: boolean;
	hasRealCover: boolean;
};

interface Props {
	posts: ArticleListPost[];
	defaultView?: ArticleListView;
	postsPerPage?: number;
}

let { posts, defaultView = "list", postsPerPage = 9 }: Props = $props();

let containerRef = $state<HTMLElement | null>(null);
let view = $state<ArticleListView>("list");
let gridColumnCount = $state(3);
let currentPage = $state(1);
let isMobile = $state(false);

const categoryColorPalette = [
	"#fbbf24", "#fb7185", "#34d399", "#60a5fa", "#a78bfa", "#f472b6",
	"#2dd4bf", "#fb923c", "#22d3ee", "#818cf8", "#e879f9", "#a3e635",
	"#f87171", "#a78bfa", "#06b6d4", "#f59e0b", "#f43f5e", "#10b981",
];

const categoryColors = $derived.by(() => {
	const map = new Map<string, string>();
	const cats = [...new Set(posts.map((p) => p.category).filter(Boolean))].sort(
		(a, b) => a.localeCompare(b, "zh-CN"),
	);
	for (let i = 0; i < cats.length; i++) {
		map.set(cats[i], categoryColorPalette[i % categoryColorPalette.length]);
	}
	return map;
});

function getCategoryColor(name: string): string {
	const color = categoryColors.get(name);
	return color ? `color: ${color}` : "";
}

const gridBreakpointMedium = 960;
const gridBreakpointSmall = 640;

const totalPages = $derived(
	Math.max(1, Math.ceil(posts.length / postsPerPage)),
);
const paginatedPosts = $derived(
	posts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage),
);

const columns = $derived(
	(() => {
		const cols = Array.from({ length: gridColumnCount }, () => [] as { post: ArticleListPost; index: number }[]);
		paginatedPosts.forEach((post, idx) => {
			const colIdx = idx % gridColumnCount;
			cols[colIdx].push({
				post,
				index: (currentPage - 1) * postsPerPage + idx,
			});
		});
		return cols;
	})(),
);

function isArticleListView(
	value: string | null | undefined,
): value is ArticleListView {
	return value === "list" || value === "grid";
}

function syncViewFromStorage() {
	if (typeof localStorage === "undefined") return;
	const savedView = localStorage.getItem("postListLayout");
	if (isArticleListView(savedView)) {
		view = savedView;
	}
}

function getGridColumnCount() {
	if (typeof window === "undefined") return 3;
	const width = containerRef?.clientWidth || window.innerWidth;
	if (width < gridBreakpointSmall) return 1;
	if (width < gridBreakpointMedium) return 2;
	return 3;
}

function updateGridColumns() {
	if (typeof window === "undefined") return;
	gridColumnCount = view === "grid" ? getGridColumnCount() : 1;
}

function handleLayoutChange(event: Event) {
	const layout = (event as CustomEvent<{ layout?: string }>).detail?.layout;
	if (!isArticleListView(layout) || layout === view) return;
	view = layout;
	updateGridColumns();
}

function handleImageLoad(event: Event) {
	const img = event.currentTarget as HTMLImageElement;
	img.classList.add("is-loaded");
	img.parentElement?.classList.remove("skeleton-shimmer");
}

function handleImageError(event: Event, apiUrls: string[]) {
	const image = event.currentTarget as HTMLImageElement;
	const nextIndex = Number(image.dataset.apiIndex || "0") + 1;
	if (nextIndex < apiUrls.length) {
		image.dataset.apiIndex = String(nextIndex);
		image.src = apiUrls[nextIndex];
		return;
	}
	image.closest(".article-grid-card__image-wrapper, .article-list-row-card__bg-wrapper")?.classList.add("is-hidden");
}

function goToPage(page: number) {
	const nextPage = Math.max(1, Math.min(totalPages, page));
	if (nextPage === currentPage) return;
	if (containerRef) {
		window.scrollTo(
			0,
			Math.max(0, window.scrollY + containerRef.getBoundingClientRect().top),
		);
	}
	requestAnimationFrame(() => {
		currentPage = nextPage;
	});
}

function generatePageNumbers(
	current: number,
	total: number,
): (number | string)[] {
	const delta = 2;
	const rangeWithDots: (number | string)[] = [];
	if (total <= 7) {
		for (let i = 1; i <= total; i++) rangeWithDots.push(i);
		return rangeWithDots;
	}
	const left = Math.max(2, current - delta);
	const right = Math.min(total - 1, current + delta);
	rangeWithDots.push(1);
	if (left > 2) rangeWithDots.push("...");
	for (let i = left; i <= right; i++) rangeWithDots.push(i);
	if (right < total - 1) rangeWithDots.push("...");
	if (total > 1) rangeWithDots.push(total);
	return rangeWithDots;
}

const pageNumbers = $derived(generatePageNumbers(currentPage, totalPages));

onMount(() => {
	view = defaultView;
	syncViewFromStorage();
	updateGridColumns();

	// 检测移动端
	const checkMobile = () => {
		isMobile = window.innerWidth < 768;
	};
	checkMobile();

	let resizeTicking = false;
	const onResize = () => {
		if (resizeTicking) return;
		resizeTicking = true;
		requestAnimationFrame(() => {
			updateGridColumns();
			checkMobile();
			resizeTicking = false;
		});
	};

	window.addEventListener("resize", onResize);
	window.addEventListener("layoutChange", handleLayoutChange);

	// Swup 替换 DOM 后重新初始化（Svelte onMount 不会重新执行）
	const onSwupReplaced = () => {
		syncViewFromStorage();
		updateGridColumns();
		checkMobile();
	};
	window.addEventListener("swup:content:replaced", onSwupReplaced);

	return () => {
		window.removeEventListener("resize", onResize);
		window.removeEventListener("layoutChange", handleLayoutChange);
		window.removeEventListener("swup:content:replaced", onSwupReplaced);
	};
});

$effect(() => {
	view;
	posts;
	if (typeof window !== "undefined") updateGridColumns();
});
</script>

{#if posts.length === 0}
	<div class="article-list-empty">
		<span class="article-list-empty__title">暂无文章</span>
		<span class="article-list-empty__meta">新的内容会显示在这里。</span>
	</div>
{:else}
	<div
		class="article-list-virtual"
		data-view={view}
		bind:this={containerRef}
		style={`--article-list-grid-columns: ${gridColumnCount};`}
	>
		{#if view === "grid"}
		<div class="article-list-view">
			<div
				class="article-list-masonry"
				style="--cols: {gridColumnCount};"
				aria-label="文章卡片列表"
			>
				{#each columns as column}
					<div class="article-list-masonry__col">
						{#each column as entry (entry.post.id)}
							{@const post = entry.post}
							{@const isPinned = post.pinned}
							<a
								href={post.url}
								class="article-grid-card"
								class:is-pinned={isPinned}
								class:text-only={isMobile}
								aria-label={`查看文章：${post.title}`}
							>
								{#if !isMobile}
								<div class="article-grid-card__image-wrapper" class:skeleton-shimmer={!!post.imageUrl}>
									{#if post.imageUrl}
									<img
										class="article-grid-card__image"
										src={post.imageUrl}
										alt={`文章配图：${post.title}`}
										loading="lazy"
										decoding="async"
										data-api-index="0"
										onload={handleImageLoad}
										onerror={(e) => handleImageError(e, post.imageApiUrls)}
									/>
									{:else}
									<div class="article-grid-card__image-placeholder"></div>
									{/if}
									<div class="article-grid-card__gradient-overlay"></div>
									{#if isPinned}
										<span class="article-grid-card__pinned-badge--corner">
											📌 置顶
										</span>
									{/if}
								</div>
								{/if}

								<div class="article-grid-card__content">
									<div class="article-grid-card__layer-1">
										<h3 class="article-grid-card__title">
											{post.title}
										</h3>
									</div>

									<div class="article-grid-card__layer-2">
										<span class="article-grid-card__meta-item">
											<svg class="article-calendar-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" fill-rule="evenodd" d="M8 4h8V2h2v2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V2h2zM5 8v12h14V8zm2 3h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm0 4h2v2h-2zm-4 0h2v2h-2zm-4 0h2v2H7z" /></svg>
											<time datetime={post.publishedIso}>{post.publishedText}</time>
										</span>
									</div>

									<div class="article-grid-card__layer-3">
										<span class="ag-category" style={getCategoryColor(post.category)}>
											#{post.category}
										</span>
										{#if post.tags.length > 0}
											<span class="ag-meta-gap" aria-hidden="true"></span>
											{#each post.tags.slice(0, 2) as tag, i (tag.name)}
												{#if i > 0}
													<span class="ag-meta-divider" aria-hidden="true">/</span>
												{/if}
												<span class="ag-tag">{tag.name}</span>
											{/each}
											{#if post.tags.length > 2}
												<span class="ag-tag-more" aria-hidden="true">+{post.tags.length - 2}</span>
											{/if}
										{/if}
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/each}
			</div>
		</div>
		{/if}

		{#if view === "list"}
		<div class="article-list-view">
			<div class="article-list-vertical" aria-label="文章列表">
				{#each paginatedPosts as post, index (post.id)}
					{@const isPinned = post.pinned}
					<a
						href={post.url}
						class="article-list-row-card"
						class:is-pinned={isPinned}
						class:has-cover={post.hasRealCover}
						data-post-id={post.id}
						aria-label={`查看文章：${post.title}`}
					>
						{#if post.imageUrl}
							<div class="article-list-row-card__bg-wrapper">
								<img
									class="article-list-row-card__bg-image"
									src={post.imageUrl}
									alt={`文章配图：${post.title}`}
									loading="lazy"
									decoding="async"
									data-api-index="0"
									onload={handleImageLoad}
									onerror={(e) => handleImageError(e, post.imageApiUrls)}
								/>
								<div class="article-list-row-card__gradient-overlay"></div>
							</div>
						{/if}

						<div class="article-list-row-card__content">
							<div class="article-list-row-card__layer-1">
								{#if isPinned}
									<span class="article-list-row-card__pinned-badge" aria-label="置顶文章">
										📌 置顶
									</span>
								{/if}
								<h3 class="article-list-row-card__title">
									{post.title}
								</h3>
							</div>

							<div class="article-list-row-card__layer-2">
								<span class="al-category" style={getCategoryColor(post.category)}>
									#{post.category}
								</span>
								<span class="article-list-row-card__meta-item">
									<svg class="article-calendar-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" fill-rule="evenodd" d="M8 4h8V2h2v2h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V2h2zM5 8v12h14V8zm2 3h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm0 4h2v2h-2zm-4 0h2v2h-2zm-4 0h2v2H7z" /></svg>
									<time datetime={post.publishedIso}>{post.publishedText}</time>
								</span>
								{#if post.tags.length > 0}
									{#each post.tags.slice(0, 3) as tag, i (tag.name)}
										{#if i > 0}
											<span class="al-meta-divider" aria-hidden="true">/</span>
										{/if}
										<span class="al-tag">{tag.name}</span>
									{/each}
									{#if post.tags.length > 3}
										<span class="al-tag-more" aria-hidden="true">+{post.tags.length - 3}</span>
									{/if}
								{/if}
							</div>

							<div class="article-list-row-card__layer-3">
								<p class="article-list-row-card__description">
									{post.description}
								</p>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
		{/if}
	</div>

	{#if totalPages > 1}
		<div class="article-list-pagination">
			<div class="article-list-pagination__inner">
				<button
					type="button"
					class="article-list-pagination__btn"
					disabled={currentPage === 1}
					aria-label="上一页"
					onclick={() => goToPage(currentPage - 1)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
				</button>

				<div class="article-list-pagination__pages">
					{#each pageNumbers as pageItem (pageItem)}
						{#if pageItem === "..."}
							<span class="article-list-pagination__dots">
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
							</span>
						{:else}
							<button
								type="button"
								class="article-list-pagination__page"
								class:is-active={pageItem === currentPage}
								aria-current={pageItem === currentPage ? "page" : undefined}
								onclick={() => goToPage(pageItem as number)}
							>
								{pageItem}
							</button>
						{/if}
					{/each}
				</div>

				<button
					type="button"
					class="article-list-pagination__btn"
					disabled={currentPage === totalPages}
					aria-label="下一页"
					onclick={() => goToPage(currentPage + 1)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
				</button>
			</div>
		</div>
	{/if}
{/if}
