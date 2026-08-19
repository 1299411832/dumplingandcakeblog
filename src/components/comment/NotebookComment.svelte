<script lang="ts">
/**
 * 自研笔记评论区（列表页聚合）
 * 数据读写复用 @waline/api（与 GuestbookChat 同机制），前端 UI 全部自研
 */
import { addComment, getComment } from "@waline/api";
import {
	BookMarked,
	Info,
	MessageCircle,
	Reply,
	Send,
	Smile,
	X,
} from "lucide-svelte";
import { onMount } from "svelte";
import { commentConfig } from "@/config/commentConfig";

interface Props {
	/** 评论所属路径 */
	path: string;
}

let { path }: Props = $props();

const serverURL = commentConfig.waline?.serverURL ?? "";
const lang = commentConfig.waline?.lang ?? "zh-CN";

type Quote = { notebook: string; title: string; href: string } | null;

type NoteComment = {
	objectId: number;
	nick: string;
	avatar: string;
	time: number;
	quote: Quote;
	text: string;
	/** 子评论：被回复者昵称 */
	replyToNick?: string;
	/** 子评论：根评论 objectId */
	rid?: number;
};

/** 回复目标：objectId 为被回复评论，rid 为根评论（回复子评论时用） */
type ReplyTarget = { objectId: number; nick: string; rid: number };

// 引用标记
const QUOTE_RE = />>QUOTE>>(.+?)\|\|(.+?)\|\|(.+?)<<QUOTE<</;

let comments = $state<NoteComment[]>([]);
let initialLoading = $state(true);
let initialError = $state("");
let sending = $state(false);

let replyNick = $state("");
let replyMail = $state("");
let replyText = $state("");
let composerError = $state("");

// 待引用笔记（由列表页卡片评论按钮点击后通过事件设置）
let pendingQuote = $state<Quote>(null);
// 回复目标（点击评论的「回复」按钮设置）
let replyTarget = $state<ReplyTarget | null>(null);
// 输入框 ref：点击回复后自动聚焦
let composerTextarea = $state<HTMLTextAreaElement | null>(null);

// 表情（Waline 原生格式：正文存 `:item:`，渲染时替换为预设图片 URL）
type EmojiTab = {
	name: string;
	icon: string;
	items: { key: string; url: string }[];
};
let emojiTabs = $state<EmojiTab[]>([]);
let emojiMap = $state<Record<string, string>>({});
let activeEmojiTab = $state(0);
let emojiOpen = $state(false);

function parseQuote(orig: string): { quote: Quote; text: string } {
	const m = orig.match(QUOTE_RE);
	if (!m) return { quote: null, text: orig };
	return {
		quote: { notebook: m[1], title: m[2], href: m[3] },
		text: orig.slice(m[0].length).replace(/^\n/, ""),
	};
}

/** 单条评论标准化（可传入被回复者昵称用于子评论） */
function normalizeComment(
	comment: {
		objectId: number;
		nick?: string;
		avatar?: string;
		time: number;
		comment?: string;
		orig?: string;
		rid?: number;
	},
	replyToNick?: string,
): NoteComment {
	const orig = comment.orig || comment.comment || "";
	const { quote, text } = parseQuote(orig);
	return {
		objectId: comment.objectId,
		nick: comment.nick || "匿名访客",
		avatar: comment.avatar || "",
		time: comment.time,
		quote,
		text,
		replyToNick,
		rid: replyToNick ? comment.rid : undefined,
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const message = error.message;
		if (/failed to fetch|networkerror|network request/iu.test(message)) {
			return "无法连接到评论服务，请检查网络后重试";
		}
		if (/(401|403|unauthorized|forbidden|token|登录)/iu.test(message)) {
			return "评论服务登录状态异常，请稍后重试";
		}
		if (/(required|word|length|content|字数|内容)/iu.test(message)) {
			return "评论内容不符合要求，请检查后重试";
		}
	}
	return "评论服务暂时不可用，请稍后重试";
}

async function loadComments() {
	if (!serverURL) {
		initialLoading = false;
		initialError = "评论服务未配置，无法加载评论";
		return;
	}
	initialLoading = true;
	initialError = "";
	try {
		const response = await getComment({
			serverURL,
			lang,
			path,
			page: 1,
			pageSize: 100,
			sortBy: "insertedAt_asc",
		});
		// 展平根评论 + 子评论（Waline 平铺模式返回树形结构）
		const flat: NoteComment[] = [];
		for (const root of response.data || []) {
			flat.push(normalizeComment(root));
			for (const child of root.children || []) {
				flat.push(
					normalizeComment(
						child,
						child.reply_user?.nick || child.at || root.nick || "访客",
					),
				);
			}
		}
		comments = flat;
	} catch (error) {
		initialError = getErrorMessage(error);
	} finally {
		initialLoading = false;
	}
}

async function submitComment() {
	if (sending) return;
	if (!serverURL) {
		composerError = "评论服务未配置，暂时无法发布";
		return;
	}
	const nick = replyNick.trim();
	const mail = replyMail.trim();
	const text = replyText.trim();
	if (!nick) {
		composerError = "请填写昵称";
		return;
	}
	if (!mail) {
		composerError = "请填写邮箱";
		return;
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(mail)) {
		composerError = "邮箱格式不正确";
		return;
	}
	if (!text) {
		composerError = "请填写评论内容";
		return;
	}
	sending = true;
	composerError = "";
	try {
		const quoteTarget = pendingQuote;
		const target = replyTarget;
		const body = quoteTarget
			? `>>QUOTE>>${quoteTarget.notebook}||${quoteTarget.title}||${quoteTarget.href}<<QUOTE<<\n${text}`
			: text;
		const response = await addComment({
			serverURL,
			lang,
			comment: {
				nick,
				mail,
				comment: body,
				ua: navigator.userAgent,
				url: path,
				// 回复时带父/根评论 id 与被回复者昵称（Waline 平铺模式）
				pid: target?.objectId,
				rid: target?.rid,
				at: target?.nick,
			},
		});
		if (response.errno || !response.data) {
			throw new Error(response.errmsg || "评论提交失败");
		}
		const comment = response.data;
		const orig = comment.orig || body;
		const { quote, text: cleanText } = parseQuote(orig);
		const isReply = target !== null;
		comments = [
			...comments,
			{
				objectId: comment.objectId,
				nick: comment.nick || nick,
				avatar: comment.avatar || "",
				time: comment.time,
				quote,
				text: cleanText,
				replyToNick: isReply ? target.nick : undefined,
				rid: isReply ? target.rid : undefined,
			},
		];
		replyText = "";
		replyMail = "";
		replyTarget = null;
	} catch (error) {
		composerError = getErrorMessage(error);
	} finally {
		sending = false;
	}
}

function onQuoteRequest(event: Event) {
	const detail = (event as CustomEvent).detail as
		| { notebook?: string; title?: string; href?: string }
		| undefined;
	if (!detail) return;
	pendingQuote = {
		notebook: detail.notebook || "笔记本",
		title: detail.title || "未命名笔记",
		href: detail.href || "/life/notebooks/",
	};
}

/** 回复某条评论：根评论 rid 为自身，子评论沿用其根 id */
function selectReply(comment: NoteComment) {
	replyTarget = {
		objectId: comment.objectId,
		nick: comment.nick,
		rid: comment.rid || comment.objectId,
	};
	composerError = "";
	composerTextarea?.focus();
}

function formatTime(t: number): string {
	if (!t) return "";
	const d = new Date(t);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 加载 Waline 表情预设（commentConfig.waline.emoji 的 URL 数组）
 * 每个预设目录下有 info.json：{ name, prefix, type, items }
 * 表情图片 URL = `{base}/{prefix}{item}.{type}`，正文标记为 `:{item}:`
 * 与 Waline 原生评论区完全兼容：历史/未来表情互相可见
 */
async function loadEmojis() {
	const urls = commentConfig.waline?.emoji ?? [];
	const tabs: EmojiTab[] = [];
	const map: Record<string, string> = {};
	for (const baseUrl of urls) {
		try {
			const base = baseUrl.replace(/\/+$/u, "");
			const info = await fetch(`${base}/info.json`).then((r) => r.json());
			const prefix = info.prefix || "";
			const type = info.type || "png";
			const tab: EmojiTab = {
				name: info.name || "Emoji",
				icon: `${base}/${prefix}${info.icon || ""}.${type}`,
				items: (info.items || []).map((key: string) => ({
					key,
					url: `${base}/${prefix}${key}.${type}`,
				})),
			};
			tabs.push(tab);
			// 同名表情后者覆盖前者（与 Waline 客户端行为一致）
			for (const item of tab.items) map[item.key] = item.url;
		} catch {
			// 单个预设加载失败不影响其它
		}
	}
	emojiTabs = tabs;
	emojiMap = map;
}

/** 把正文中的 `:item:` 标记解析为文本 + 表情片段（未加载完时原样返回文本） */
function parseEmoji(text: string): (string | { url: string; key: string })[] {
	const parts: (string | { url: string; key: string })[] = [];
	const re = /:([^\s:]{1,40}):/gu;
	let last = 0;
	let m: RegExpExecArray | null = re.exec(text);
	while (m !== null) {
		if (m.index > last) parts.push(text.slice(last, m.index));
		const url = emojiMap[m[1]];
		parts.push(url ? { url, key: m[1] } : m[0]);
		last = m.index + m[0].length;
		m = re.exec(text);
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts;
}

/** 在光标处插入表情标记 */
function insertEmoji(key: string) {
	const el = composerTextarea;
	if (!el) {
		replyText = `${replyText}:${key}:`;
		return;
	}
	const start = el.selectionStart ?? replyText.length;
	const end = el.selectionEnd ?? start;
	const token = `:${key}:`;
	replyText = replyText.slice(0, start) + token + replyText.slice(end);
	requestAnimationFrame(() => {
		const pos = start + token.length;
		el.setSelectionRange(pos, pos);
		el.focus();
	});
}

/** 点击面板外关闭表情面板 */
function handleDocClick(event: MouseEvent) {
	if (emojiOpen && !(event.target as HTMLElement).closest?.(".nc-emoji")) {
		emojiOpen = false;
	}
}

onMount(() => {
	void loadComments();
	void loadEmojis();
	const controller = new AbortController();
	window.addEventListener("notebook-comment-quote", onQuoteRequest, {
		signal: controller.signal,
	});
	document.addEventListener("click", handleDocClick, {
		signal: controller.signal,
	});
	return () => controller.abort();
});
</script>

<div class="nc-wrap" id="comments">
	<!-- 标题 -->
	<div class="nc-head">
		<MessageCircle size="1.25rem" style="color: var(--primary)" />
		<h3 class="nc-head-title">评论</h3>
		<span class="nc-head-count">{comments.length}</span>
	</div>

	<!-- 待引用笔记 / 空状态提示 -->
	{#if pendingQuote}
		<div class="nc-quote">
			<a class="nc-quote-link" href={pendingQuote.href} title="点击跳转到笔记详情页">
				<BookMarked size="1.25rem" style="color: var(--primary)" />
				<div class="nc-quote-info">
					<span class="nc-quote-notebook">{pendingQuote.notebook}</span>
					<span class="nc-quote-title">{pendingQuote.title}</span>
				</div>
			</a>
			<button
				type="button"
				class="nc-quote-close"
				onclick={() => (pendingQuote = null)}
				aria-label="取消引用"
				title="取消引用"
			>
				<X size="0.875rem" />
			</button>
		</div>
	{:else}
		<p class="nc-quote-tip">
			<Info size="0.8125rem" aria-hidden="true" />
			<span>点击笔记卡片的「评论」按钮，可引用该笔记发表评论</span>
		</p>
	{/if}

	<!-- 输入区 -->
	<div class="nc-composer">
		{#if replyTarget}
			<div class="nc-reply-bar" role="status">
				<span class="nc-reply-bar-text">回复 <strong>@{replyTarget.nick}</strong></span>
				<button
					type="button"
					class="nc-reply-bar-close"
					onclick={() => (replyTarget = null)}
					aria-label="取消回复"
					title="取消回复"
				>
					<X size="0.875rem" />
				</button>
			</div>
		{/if}
		<div class="nc-fields">
			<input bind:value={replyNick} class="nc-input" type="text" placeholder="昵称 *" maxlength="30" />
			<input bind:value={replyMail} class="nc-input" type="email" placeholder="邮箱 *" maxlength="60" />
		</div>
		<textarea bind:value={replyText} bind:this={composerTextarea} class="nc-textarea" rows="3" placeholder="写下你的评论…" maxlength="500"></textarea>
		{#if composerError}<p class="nc-error">{composerError}</p>{/if}
		<div class="nc-composer-foot">
			<span class="nc-hint">{replyTarget
				? `回复 @${replyTarget.nick}${pendingQuote ? "，并引用上方笔记" : ""}`
				: pendingQuote
					? "将引用上方笔记发表"
					: "支持回复任意评论"}</span>
			<div class="nc-composer-actions">
				<div class="nc-emoji">
					<button
						type="button"
						class="nc-emoji-btn"
						onclick={() => (emojiOpen = !emojiOpen)}
						aria-expanded={emojiOpen}
						aria-label="选择表情"
						title="选择表情"
					>
						<Smile size="1rem" />
					</button>
					{#if emojiOpen}
						<div class="nc-emoji-panel" role="listbox" aria-label="表情选择">
							{#if emojiTabs.length === 0}
								<p class="nc-emoji-loading">表情加载中…</p>
							{:else}
								<div class="nc-emoji-tabs" role="tablist">
									{#each emojiTabs as tab, i (tab.name)}
										<button
											type="button"
											class:is-active={activeEmojiTab === i}
											class="nc-emoji-tab"
											onclick={() => (activeEmojiTab = i)}
											role="tab"
											aria-selected={activeEmojiTab === i}
										>
											<img src={tab.icon} alt={tab.name} loading="lazy" />
										</button>
									{/each}
								</div>
								<div class="nc-emoji-grid" role="listbox" aria-label={emojiTabs[activeEmojiTab]?.name ?? "表情"}>
									{#each emojiTabs[activeEmojiTab]?.items ?? [] as item (item.key)}
										<button
											type="button"
											class="nc-emoji-item"
											onclick={() => insertEmoji(item.key)}
											title={`:${item.key}:`}
										>
											<img src={item.url} alt={`:${item.key}:`} loading="lazy" />
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
				<button type="button" class="nc-submit" onclick={() => void submitComment()} disabled={sending}>
					<Send size="0.875rem" />
					<span>{sending ? "提交中…" : "发表评论"}</span>
				</button>
			</div>
		</div>
	</div>

	<!-- 评论列表 -->
	<div class="nc-list">
		{#if initialLoading}
			<div class="nc-empty">加载中…</div>
		{:else if initialError}
			<div class="nc-empty nc-empty-error">{initialError}</div>
		{:else if comments.length === 0}
			<div class="nc-empty">还没有评论，来抢沙发吧～</div>
		{:else}
			{#each comments as c (c.objectId)}
				<div class:is-reply={c.replyToNick !== undefined} class="nc-item">
					<div class="nc-avatar">
						{#if c.avatar}
							<img src={c.avatar} alt={c.nick} class="nc-avatar-img" loading="lazy" />
						{:else}
							<span class="nc-avatar-char">{c.nick.slice(0, 1) || "?"}</span>
						{/if}
					</div>
					<div class="nc-body">
						<div class="nc-meta">
							<span class="nc-nick">{c.nick}</span>
							<span class="nc-time">{formatTime(c.time)}</span>
							<button
								type="button"
								class="nc-reply-btn"
								onclick={() => selectReply(c)}
								aria-label={`回复 ${c.nick}`}
								title={`回复 ${c.nick}`}
							>
								<Reply size="0.75rem" />
								<span>回复</span>
							</button>
						</div>
						{#if c.replyToNick}
							<span class="nc-reply-to">回复 @{c.replyToNick}</span>
						{/if}
						{#if c.quote}
							<a class="nc-quote-inline" href={c.quote.href} title="点击跳转到引用笔记">
								<span class="nc-quote-inline-label">{`📌 ${c.quote.notebook}`}</span>
								<span class="nc-quote-inline-title">{c.quote.title}</span>
							</a>
						{/if}
						<div class="nc-text">
							{#each c.text.split("\n") as line, i (i)}
								<p>
									{#each parseEmoji(line) as part, j (j)}
										{#if typeof part === "string"}
											{part || "　"}
										{:else}
											<img src={part.url} alt={`:${part.key}:`} class="nc-emoji-img" loading="lazy" />
										{/if}
									{/each}
								</p>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.nc-wrap {
		width: 100%;
	}

	.nc-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.nc-head-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--deep-text);
		margin: 0;
	}

	.nc-head-count {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--btn-regular-bg);
		color: var(--content-meta);
	}

	/* 引用当前笔记 */
	.nc-quote {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	.nc-quote-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex: 1;
		min-width: 0;
		padding: 0.75rem 1rem;
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		border-radius: 0.75rem;
		border-left: 4px solid var(--primary);
		background: color-mix(in srgb, var(--primary) 5%, transparent);
		text-decoration: none;
		transition: background-color 0.2s ease, transform 0.2s ease;
	}

	.nc-quote-link:hover {
		background: color-mix(in srgb, var(--primary) 9%, transparent);
		transform: translateY(-1px);
	}

	.nc-quote-close {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 9999px;
		background: transparent;
		color: var(--content-meta);
		cursor: pointer;
		transition: background-color 0.2s ease, color 0.2s ease;
	}

	.nc-quote-close:hover {
		background: var(--btn-regular-bg);
		color: var(--deep-text);
	}

	/* 无引用时的轻量提示 */
	.nc-quote-tip {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0 0 0.75rem;
		font-size: 0.75rem;
		color: var(--content-meta);
		opacity: 0.85;
	}

	.nc-quote-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.nc-quote-notebook {
		font-size: 0.6875rem;
		color: var(--primary);
		font-weight: 600;
	}

	.nc-quote-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--deep-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* 输入区 */
	.nc-composer {
		padding: 1rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.75rem;
		background: var(--card-bg);
		margin-bottom: 1.25rem;
	}

	/* 回复目标条 */
	.nc-reply-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.625rem;
		padding: 0.375rem 0.5rem 0.375rem 0.75rem;
		border-radius: 0.5rem;
		background: var(--btn-regular-bg);
	}

	.nc-reply-bar-text {
		font-size: 0.75rem;
		color: var(--content-meta);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nc-reply-bar-text strong {
		color: var(--primary);
		font-weight: 600;
	}

	.nc-reply-bar-close {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 9999px;
		background: transparent;
		color: var(--content-meta);
		cursor: pointer;
		transition: background-color 0.2s ease, color 0.2s ease;
	}

	.nc-reply-bar-close:hover {
		background: var(--btn-regular-bg-hover);
		color: var(--deep-text);
	}

	/* 表情按钮 + 面板（位于底栏发送按钮左侧） */
	.nc-emoji {
		position: relative;
		display: inline-block;
	}

	.nc-emoji-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.5rem;
		background: var(--page-bg);
		color: var(--content-meta);
		cursor: pointer;
		transition: border-color 0.2s ease, color 0.2s ease;
	}

	.nc-emoji-btn:hover,
	.nc-emoji-btn[aria-expanded="true"] {
		border-color: var(--primary);
		color: var(--primary);
	}

	.nc-emoji-panel {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		right: 0;
		z-index: 30;
		width: 20rem;
		max-width: calc(100vw - 2rem);
		padding: 0.625rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.75rem;
		background: var(--card-bg);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}

	.nc-emoji-loading {
		margin: 0;
		padding: 0.75rem 0;
		text-align: center;
		font-size: 0.75rem;
		color: var(--content-meta);
	}

	.nc-emoji-tabs {
		display: flex;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.nc-emoji-tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0.25rem;
		border: 1px solid transparent;
		border-radius: 0.5rem;
		background: transparent;
		cursor: pointer;
		transition: background-color 0.2s ease, border-color 0.2s ease;
	}

	.nc-emoji-tab img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.nc-emoji-tab.is-active {
		border-color: var(--primary);
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.nc-emoji-grid {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 0.25rem;
		max-height: 11rem;
		overflow-y: auto;
	}

	.nc-emoji-item {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.nc-emoji-item:hover {
		background: var(--btn-regular-bg);
	}

	.nc-emoji-item img {
		width: 1.5rem;
		height: 1.5rem;
		object-fit: contain;
	}

	/* 评论正文中的表情图片 */
	.nc-emoji-img {
		display: inline-block;
		width: 1.25rem;
		height: 1.25rem;
		vertical-align: text-bottom;
		margin: 0 0.0625rem;
	}

	.nc-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
		margin-bottom: 0.625rem;
	}

	@media (max-width: 480px) {
		.nc-fields {
			grid-template-columns: 1fr;
		}
	}

	.nc-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.5rem;
		background: var(--page-bg);
		color: var(--deep-text);
		font-size: 0.8125rem;
		outline: none;
		transition: border-color 0.2s ease;
		box-sizing: border-box;
	}

	.nc-input:focus {
		border-color: var(--primary);
	}

	.nc-textarea {
		width: 100%;
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.5rem;
		background: var(--page-bg);
		color: var(--deep-text);
		font-size: 0.8125rem;
		line-height: 1.6;
		resize: vertical;
		outline: none;
		transition: border-color 0.2s ease;
		box-sizing: border-box;
		font-family: inherit;
	}

	.nc-textarea:focus {
		border-color: var(--primary);
	}

	.nc-error {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: #e5484d;
	}

	.nc-composer-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.625rem;
	}

	.nc-composer-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.nc-hint {
		font-size: 0.6875rem;
		color: var(--content-meta);
		opacity: 0.8;
	}

	.nc-submit {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1.25rem;
		border: none;
		border-radius: 9999px;
		background: var(--primary);
		color: var(--page-bg);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease, transform 0.15s ease;
	}

	.nc-submit:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.nc-submit:not(:disabled):hover {
		opacity: 0.85;
		transform: translateY(-1px);
	}

	/* 评论列表 */
	.nc-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.nc-empty {
		padding: 2rem 1rem;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--content-meta);
	}

	.nc-empty-error {
		color: #e5484d;
	}

	.nc-item {
		display: flex;
		gap: 0.75rem;
		padding-bottom: 1rem;
		border-bottom: 1px dashed var(--line-divider);
	}

	.nc-item:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.nc-avatar {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		overflow: hidden;
		border: 2px solid var(--primary);
		background: var(--btn-regular-bg);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.nc-avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.nc-avatar-char {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--primary);
	}

	.nc-body {
		flex: 1;
		min-width: 0;
	}

	.nc-meta {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}

	.nc-nick {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--primary);
	}

	.nc-time {
		font-size: 0.6875rem;
		color: var(--content-meta);
	}

	/* 回复按钮（meta 区小按钮） */
	.nc-reply-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.375rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		font-size: 0.6875rem;
		color: var(--content-meta);
		cursor: pointer;
		transition: background-color 0.2s ease, color 0.2s ease;
	}

	.nc-reply-btn:hover {
		background: var(--btn-regular-bg);
		color: var(--primary);
	}

	/* 「回复 @xxx」标记 */
	.nc-reply-to {
		display: inline-block;
		margin-bottom: 0.375rem;
		font-size: 0.6875rem;
		color: var(--primary);
		opacity: 0.85;
	}

	/* 子评论缩进 */
	.nc-item.is-reply {
		padding-left: 2rem;
	}

	@media (max-width: 480px) {
		.nc-item.is-reply {
			padding-left: 1rem;
		}
	}

	/* 评论内引用块 */
	.nc-quote-inline {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin-bottom: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--line-divider);
		border-radius: 0.5rem;
		border-left: 3px solid var(--primary);
		background: var(--btn-regular-bg);
		text-decoration: none;
		transition: background-color 0.2s ease;
	}

	.nc-quote-inline:hover {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
	}

	.nc-quote-inline-label {
		font-size: 0.6875rem;
		color: var(--primary);
		font-weight: 600;
	}

	.nc-quote-inline-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--deep-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nc-text p {
		margin: 0 0 0.25rem;
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--deep-text);
		word-break: break-word;
		white-space: pre-wrap;
	}

	.nc-text p:last-child {
		margin-bottom: 0;
	}
</style>
