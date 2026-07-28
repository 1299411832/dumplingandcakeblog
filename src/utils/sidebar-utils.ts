import { isCurrentPagePost } from "./grid-layout-utils";

/**
 * Update sidebar widget visibility based on whether
 * the current page is a post detail page
 */
export function updateSidebarComponentsVisibility(): void {
	const isPostPage = isCurrentPagePost();

	// Hide widgets marked to hide on post pages
	document.querySelectorAll(".widget-hide-on-post").forEach((widget) => {
		isPostPage
			? widget.classList.add("hidden")
			: widget.classList.remove("hidden");
	});

	// Hide widgets marked to hide on non-post pages
	document.querySelectorAll(".widget-hide-on-non-post").forEach((widget) => {
		!isPostPage
			? widget.classList.add("hidden")
			: widget.classList.remove("hidden");
	});
}
