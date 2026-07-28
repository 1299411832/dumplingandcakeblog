import { BANNER_HEIGHT } from "@/constants/constants";

declare global {
	interface Window {
		_navbarHidden?: boolean;
		_lastScrollY?: number;
	}
}

/**
 * Initialize scroll-based UI behaviors:
 * - Back-to-top button visibility
 * - TOC visibility
 * - Navbar auto-hide/show based on scroll direction
 */
export function initScrollHandler(): void {
	const bannerEnabled = !!document.getElementById("wallpaper-wrapper");
	const backToTopBtn = document.getElementById("back-to-top-btn");
	const toc = document.getElementById("toc-wrapper");
	const navbar = document.getElementById("navbar-wrapper");

	function scrollFunction() {
		const scrollTop = document.documentElement.scrollTop;
		const bannerHeight = window.innerHeight * (BANNER_HEIGHT / 100);

		// Batch DOM operations for performance
		const operations: (() => void)[] = [];

		if (backToTopBtn) {
			operations.push(() => {
				if (scrollTop > bannerHeight) {
					backToTopBtn.classList.remove("hide");
				} else {
					backToTopBtn.classList.add("hide");
				}
			});
		}

		if (bannerEnabled && toc) {
			operations.push(() => {
				if (scrollTop > bannerHeight) {
					toc.classList.remove("toc-hide");
				} else {
					toc.classList.add("toc-hide");
				}
			});
		}

		// Scroll direction detection - navbar auto-hide/show (always active)
		if (navbar) {
			operations.push(() => {
				const currentScrollY =
					window.pageYOffset || document.documentElement.scrollTop;

				// Always show at top
				if (currentScrollY <= 10) {
					navbar.classList.remove("navbar-hidden");
					navbar.classList.add("navbar-visible");
					window._navbarHidden = false;
					const _navEl2 = document.getElementById("navbar");
					if (_navEl2) _navEl2.classList.remove("scrolled");
					window._lastScrollY = currentScrollY;
					return;
				}

				const lastScrollY = window._lastScrollY || 0;
				const isHidden = window._navbarHidden || false;

				// Enable navbar pill-shaped shrink after scrolling 20px
				const _navEl = document.getElementById("navbar");
				if (_navEl) {
					if (currentScrollY > 20) {
						_navEl.classList.add("scrolled");
					}
				}
				const scrollDelta = currentScrollY - lastScrollY;

				// Scrolling up - show navbar
				if (scrollDelta < 0) {
					if (isHidden) {
						navbar.classList.remove("navbar-hidden");
						navbar.classList.add("navbar-visible");
						window._navbarHidden = false;
					}
				}
				// Scrolling down more than 50px - hide navbar
				else if (scrollDelta > 50 && !isHidden) {
					navbar.classList.remove("navbar-visible");
					navbar.classList.add("navbar-hidden");
					window._navbarHidden = true;
				}

				window._lastScrollY = currentScrollY;
			});
		}

		// Batch execute DOM operations
		if (operations.length > 0) {
			requestAnimationFrame(() => {
				operations.forEach((op) => op());
			});
		}
	}

	// Optimized scroll performance handling
	let scrollTimeout: number;
	window.addEventListener(
		"scroll",
		() => {
			if (scrollTimeout) {
				cancelAnimationFrame(scrollTimeout);
			}
			scrollTimeout = requestAnimationFrame(scrollFunction);
		},
		{ passive: true },
	);
}
