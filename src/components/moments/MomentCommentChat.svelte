<script lang="ts">
import {
	addComment,
	deleteComment,
	getComment,
	login as loginWithWaline,
	updateComment,
} from "@waline/api";
import {
	AlertCircle,
	Bell,
	ChevronDown,
	ChevronRight,
	LoaderCircle,
	RefreshCw,
	RotateCcw,
	Users,
	WifiOff,
	X,
} from "lucide-svelte";
import { onMount, tick } from "svelte";
import { commentConfig } from "@/config/commentConfig";
import { guestbookConfig } from "@/config/guestbookConfig";
import type { GuestbookAnnouncementItem } from "@/types/config";
import type {
	GuestbookAuthUser,
	GuestbookImageAttachment,
	GuestbookProfile,
} from "@/types/guestbook-chat";
import type {
	MomentChatMessage,
	MomentQuote,
} from "@/types/moment-chat";
import {
	appendMomentImage,
	buildMomentBody,
	flattenMomentComments,
	getMomentErrorMessage,
	getMomentInitials,
	getMomentTextLength,
	hasMomentImage,
	isMomentAuthError,
	mergeMomentMessages,
	MOMENT_CHANNEL,
	normalizeMomentComment,
} from "@/utils/moment-chat";
import GuestbookChatComposer from "../features/GuestbookChatComposer.svelte";
import GuestbookChatMessage from "../features/GuestbookChatMessage.svelte";

const CHANNEL_PATH = MOMENT_CHANNEL;
const PAGE_SIZE = 30;
const POLL_INTERVAL = 30_000;
const MIN_MESSAGE_LENGTH = 2;
const MAX_MESSAGE_LENGTH = 300;
const PROFILE_STORAGE_KEY = "moment-chat-profile";
const AUTH_STORAGE_KEY = "moment-chat-auth";
const DRAFT_STORAGE_KEY = "moment-chat-draft";
const serverURL = commentConfig.waline?.serverURL ?? "";
const lang = commentConfig.waline?.lang ?? "zh-CN";
const loginMode = commentConfig.waline?.login ?? "enable";
const announcements = guestbookConfig.announcements;
const adminNicknames = new Set(guestbookConfig.adminNicknames ?? []);

let messages = $state<MomentChatMessage[]>([]);
let profile = $state<GuestbookProfile>({ nick: "", mail: "", link: "" });
let authUser = $state<GuestbookAuthUser | null>(null);
let draft = $state("");
let momentQuote = $state<MomentQuote | null>(null);
let visible = $state(false);
let initialLoading = $state(true);
let initialError = $state("");
let syncError = $state("");
let composerError = $state("");
let loadingOlder = $state(false);
let syncing = $state(false);
let loggingIn = $state(false);
let isOffline = $state(false);
let currentPage = $state(1);
let totalPages = $state(0);
let totalCount = $state(0);
let newMessageCount = $state(0);
let lastSyncedAt = $state<number | null>(null);
let messageList = $state<HTMLDivElement | null>(null);
let announcementDialog = $state<HTMLDialogElement | null>(null);
let deleteDialog = $state<HTMLDialogElement | null>(null);
let selectedAnnouncement = $state<GuestbookAnnouncementItem | null>(null);
let sidebarOpen = $state(false);
let showScrollToBottom = $state(false);
let editingMessageId = $state<string | null>(null);
let editDraft = $state("");
let mutatingMessageId = $state<string | null>(null);
let messageActionError = $state<{ id: string; message: string } | null>(null);
let deleteTarget = $state<MomentChatMessage | null>(null);
let pollTimer: number | undefined;
let dataController: AbortController | null = null;
let syncQueued = false;
let initialMediaCleanup: (() => void) | null = null;

const hasMore = $derived(currentPage < totalPages);
const isSending = $derived(
	messages.some((message) => message.localState === "sending"),
);
const chatMembers = $derived.by(() => {
	const members = new Map<
		string,
		Pick<MomentChatMessage, "nick" | "avatar" | "link" | "isAdmin">
	>();
	for (const message of messages) {
		const key = `${message.nick.trim().toLocaleLowerCase()}|${message.avatar}`;
		const current = members.get(key);
		if (!current || message.isAdmin || (!current.link && message.link)) {
			members.set(key, {
				nick: message.nick,
				avatar: message.avatar,
				link: message.link || current?.link,
				isAdmin: message.isAdmin || current?.isAdmin,
			});
		}
	}
	return [...members.values()].sort(
		(left, right) => Number(right.isAdmin) - Number(left.isAdmin),
	);
});

function canManageMessage(message: MomentChatMessage): boolean {
	if (!authUser?.token || !message.objectId || message.localState) return false;
	return (
		authUser.type === "administrator" ||
		(typeof message.userId === "number" && message.userId === authUser.objectId)
	);
}

function handleChatKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	if (visible) {
		closeModal();
		return;
	}
	sidebarOpen = false;
}

async function openAnnouncement(announcement: GuestbookAnnouncementItem) {
	selectedAnnouncement = announcement;
	sidebarOpen = false;
	await tick();
	if (!announcementDialog?.open) announcementDialog?.showModal();
	document.body.style.overflow = "hidden";
}

function closeAnnouncement() {
	if (announcementDialog?.open) announcementDialog.close();
	if (!visible) document.body.style.overflow = "";
}

function closeDeleteDialog() {
	if (deleteTarget && mutatingMessageId === deleteTarget.id) return;
	if (deleteDialog?.open) deleteDialog.close();
	deleteTarget = null;
	if (!visible) document.body.style.overflow = "";
}

async function requestDeleteMessage(message: MomentChatMessage) {
	if (!canManageMessage(message)) return;
	messageActionError = null;
	deleteTarget = message;
	await tick();
	if (!deleteDialog?.open) deleteDialog?.showModal();
	document.body.style.overflow = "hidden";
}

function readStoredValue<T>(storage: Storage, key: string): T | null {
	try {
		const raw = storage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function readStoredString(storage: Storage, key: string): string {
	try {
		return storage.getItem(key) ?? "";
	} catch {
		return "";
	}
}

function writeStoredValue(storage: Storage, key: string, value: unknown) {
	try {
		storage.setItem(key, JSON.stringify(value));
	} catch {
		// Storage can be unavailable in private browsing or restrictive environments.
	}
}

function writeStoredString(storage: Storage, key: string, value: string) {
	try {
		storage.setItem(key, value);
	} catch {
		// Keep the in-memory state when persistence is unavailable.
	}
}

function removeStoredValue(storage: Storage, key: string) {
	try {
		storage.removeItem(key);
	} catch {
		// The in-memory state remains authoritative for the current page.
	}
}

function isAuthUser(value: unknown): value is GuestbookAuthUser {
	if (!value || typeof value !== "object") return false;
	const user = value as Partial<GuestbookAuthUser>;
	return (
		typeof user.display_name === "string" &&
		typeof user.email === "string" &&
		typeof user.token === "string" &&
		user.token.length > 0 &&
		typeof user.objectId === "number" &&
		(user.type === "administrator" || user.type === "guest")
	);
}

function isProfile(value: unknown): value is GuestbookProfile {
	if (!value || typeof value !== "object") return false;
	const storedProfile = value as Partial<GuestbookProfile>;
	return (
		typeof storedProfile.nick === "string" &&
		typeof storedProfile.mail === "string" &&
		typeof storedProfile.link === "string"
	);
}

function readAuthentication(): GuestbookAuthUser | null {
	const sessionUser = readStoredValue<unknown>(
		sessionStorage,
		AUTH_STORAGE_KEY,
	);
	if (isAuthUser(sessionUser)) return sessionUser;
	const persistentUser = readStoredValue<unknown>(
		localStorage,
		AUTH_STORAGE_KEY,
	);
	if (!isAuthUser(persistentUser)) return null;
	if (persistentUser.type === "administrator") {
		removeStoredValue(localStorage, AUTH_STORAGE_KEY);
		writeStoredValue(sessionStorage, AUTH_STORAGE_KEY, persistentUser);
	}
	return persistentUser;
}

function persistAuthentication(user: GuestbookAuthUser) {
	removeStoredValue(localStorage, AUTH_STORAGE_KEY);
	removeStoredValue(sessionStorage, AUTH_STORAGE_KEY);
	const storage =
		user.type === "administrator"
			? sessionStorage
			: user.remember
				? localStorage
				: sessionStorage;
	writeStoredValue(storage, AUTH_STORAGE_KEY, user);
}

function clearAuthentication() {
	authUser = null;
	editingMessageId = null;
	editDraft = "";
	deleteTarget = null;
	messageActionError = null;
	if (deleteDialog?.open) deleteDialog.close();
	removeStoredValue(localStorage, AUTH_STORAGE_KEY);
	removeStoredValue(sessionStorage, AUTH_STORAGE_KEY);
}

interface WalineTokenResponse {
	errno: number;
	errmsg?: string;
	data?: unknown;
}

function removeLoginTokenFromURL() {
	const url = new URL(window.location.href);
	if (!url.searchParams.has("token")) return;
	url.searchParams.delete("token");
	window.history.replaceState(
		window.history.state,
		"",
		`${url.pathname}${url.search}${url.hash}`,
	);
}

async function restoreWalineRedirectLogin(token: string) {
	if (!serverURL) throw new Error("Waline 服务地址未配置，暂时无法登录");
	const response = await fetch(
		`${serverURL.replace(/\/+$/u, "")}/api/token?lang=${encodeURIComponent(lang)}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	if (!response.ok) throw new Error("登录信息验证失败，请重新登录");

	const result = (await response.json()) as WalineTokenResponse;
	const user =
		result.errno === 0 && result.data && typeof result.data === "object"
			? { ...(result.data as Record<string, unknown>), token, remember: false }
			: null;
	if (!isAuthUser(user)) {
		throw new Error(result.errmsg || "登录信息已失效，请重新登录");
	}

	authUser = user;
	persistAuthentication(user);
	composerError = "";
}

function finishDataRequest(controller: AbortController) {
	if (dataController !== controller) return;
	dataController = null;
	if (!syncQueued) return;
	syncQueued = false;
	queueMicrotask(() => void syncLatest());
}

function queueLatestSync() {
	if (dataController) {
		syncQueued = true;
		return;
	}
	void syncLatest();
}

function handleAuthenticationError(error: unknown): boolean {
	if (!authUser || !isMomentAuthError(error)) return false;
	clearAuthentication();
	composerError = "登录状态已失效，请重新登录";
	return true;
}

async function fetchPage(page: number, signal?: AbortSignal) {
	if (!serverURL) throw new Error("Waline 服务地址未配置");
	return getComment({
		serverURL,
		lang,
		path: CHANNEL_PATH,
		page,
		pageSize: PAGE_SIZE,
		sortBy: "insertedAt_desc",
		token: authUser?.token,
		signal,
	});
}

async function loadInitial() {
	if (isOffline) {
		initialLoading = false;
		initialError = "当前处于离线状态，恢复网络后将自动加载";
		return;
	}
	dataController?.abort();
	const controller = new AbortController();
	dataController = controller;
	syncing = false;
	loadingOlder = false;
	initialLoading = true;
	initialError = "";
	syncError = "";

	try {
		const response = await fetchPage(1, controller.signal);
		if (dataController !== controller) return;
		messages = mergeMomentMessages(
			messages,
			flattenMomentComments(response.data, adminNicknames),
		);
		currentPage = 1;
		totalPages = response.totalPages;
		totalCount = response.count;
		lastSyncedAt = Date.now();
		initialLoading = false;
		await tick();
		scrollToBottom(false);
		preserveInitialBottomWhileMediaLoads();
	} catch (error) {
		if (controller.signal.aborted || dataController !== controller) return;
		const authenticationExpired = handleAuthenticationError(error);
		if (authenticationExpired) syncQueued = true;
		const message = getMomentErrorMessage(error);
		if (message && !authenticationExpired) {
			if (messages.length > 0) syncError = message;
			else initialError = message;
		}
	} finally {
		if (dataController === controller) {
			initialLoading = false;
			finishDataRequest(controller);
		}
	}
}

async function syncLatest() {
	if (initialError && messages.length === 0) {
		await loadInitial();
		return;
	}
	if (initialLoading || isOffline) return;
	if (dataController) {
		syncQueued = true;
		return;
	}
	const controller = new AbortController();
	dataController = controller;
	syncing = true;
	syncError = "";
	const wasNearBottom = isNearBottom();
	const knownIds = new Set(
		messages
			.filter((message) => !message.localState)
			.map((message) => message.id),
	);

	try {
		const response = await fetchPage(1, controller.signal);
		if (dataController !== controller) return;
		const incoming = flattenMomentComments(response.data);
		const freshCount = incoming.filter(
			(message) => !knownIds.has(message.id),
		).length;
		messages = mergeMomentMessages(messages, incoming);
		totalPages = response.totalPages;
		totalCount = response.count;
		lastSyncedAt = Date.now();
		await tick();

		if (freshCount > 0 && wasNearBottom) scrollToBottom(true);
		else if (freshCount > 0) newMessageCount += freshCount;
	} catch (error) {
		if (controller.signal.aborted || dataController !== controller) return;
		const authenticationExpired = handleAuthenticationError(error);
		if (authenticationExpired) syncQueued = true;
		const message = getMomentErrorMessage(error);
		if (message && !authenticationExpired) syncError = message;
	} finally {
		if (dataController === controller) {
			syncing = false;
			finishDataRequest(controller);
		}
	}
}

async function loadOlder() {
	if (!hasMore || loadingOlder || !messageList || dataController) return;
	const controller = new AbortController();
	dataController = controller;
	loadingOlder = true;
	const previousHeight = messageList.scrollHeight;
	const nextPage = currentPage + 1;

	try {
		const response = await fetchPage(nextPage, controller.signal);
		if (dataController !== controller) return;
		messages = mergeMomentMessages(
			messages,
			flattenMomentComments(response.data, adminNicknames),
		);
		currentPage = nextPage;
		totalPages = response.totalPages;
		totalCount = response.count;
		await tick();
		messageList.scrollTop += messageList.scrollHeight - previousHeight;
	} catch (error) {
		if (controller.signal.aborted || dataController !== controller) return;
		const authenticationExpired = handleAuthenticationError(error);
		if (authenticationExpired) syncQueued = true;
		const message = getMomentErrorMessage(error);
		if (message && !authenticationExpired) syncError = message;
	} finally {
		if (dataController === controller) {
			loadingOlder = false;
			finishDataRequest(controller);
		}
	}
}

function startPolling() {
	if (pollTimer) window.clearInterval(pollTimer);
	pollTimer = undefined;
	if (document.visibilityState !== "visible" || !navigator.onLine) return;
	pollTimer = window.setInterval(() => {
		if (document.visibilityState === "visible" && navigator.onLine) {
			void syncLatest();
		}
	}, POLL_INTERVAL);
}

function handleVisibilityChange() {
	if (document.visibilityState === "visible") {
		queueLatestSync();
		startPolling();
		return;
	}
	if (pollTimer) window.clearInterval(pollTimer);
	pollTimer = undefined;
}

function handleOnline() {
	isOffline = false;
	queueLatestSync();
	startPolling();
}

function handleOffline() {
	isOffline = true;
	syncError = "网络已断开，恢复连接后将自动同步";
	if (pollTimer) window.clearInterval(pollTimer);
	pollTimer = undefined;
	dataController?.abort();
}

function isNearBottom(): boolean {
	if (!messageList) return true;
	return (
		messageList.scrollHeight -
			messageList.scrollTop -
			messageList.clientHeight <
		120
	);
}

function scrollToBottom(smooth = true) {
	if (!messageList) return;
	const reduceMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	messageList.scrollTo({
		top: messageList.scrollHeight,
		behavior: smooth && !reduceMotion ? "smooth" : "auto",
	});
	newMessageCount = 0;
	showScrollToBottom = false;
}

function preserveInitialBottomWhileMediaLoads() {
	initialMediaCleanup?.();
	const list = messageList;
	if (!list) return;

	const listRect = list.getBoundingClientRect();
	const pendingImages = Array.from(
		list.querySelectorAll<HTMLImageElement>(".guestbook-message__body img"),
	).filter((image) => {
		if (image.complete) return false;
		const imageRect = image.getBoundingClientRect();
		return (
			imageRect.bottom >= listRect.top - list.clientHeight &&
			imageRect.top <= listRect.bottom + list.clientHeight
		);
	});
	if (pendingImages.length === 0) return;

	const handlers = new Map<HTMLImageElement, () => void>();
	const cancel = () => cleanup();
	const cleanup = () => {
		for (const [image, handler] of handlers) {
			image.removeEventListener("load", handler);
			image.removeEventListener("error", handler);
		}
		handlers.clear();
		list.removeEventListener("wheel", cancel);
		list.removeEventListener("touchstart", cancel);
		list.removeEventListener("pointerdown", cancel);
		if (initialMediaCleanup === cleanup) initialMediaCleanup = null;
	};

	for (const image of pendingImages) {
		const handler = () => {
			image.removeEventListener("load", handler);
			image.removeEventListener("error", handler);
			handlers.delete(image);
			scrollToBottom(false);
			if (handlers.size === 0) cleanup();
		};
		handlers.set(image, handler);
		image.addEventListener("load", handler, { once: true });
		image.addEventListener("error", handler, { once: true });
	}

	list.addEventListener("wheel", cancel, { passive: true });
	list.addEventListener("touchstart", cancel, { passive: true });
	list.addEventListener("pointerdown", cancel);
	initialMediaCleanup = cleanup;
}

function handleMessageScroll() {
	if (!messageList) return;
	if (messageList.scrollTop < 72 && hasMore) void loadOlder();
	const nearBottom = isNearBottom();
	showScrollToBottom = !nearBottom;
	if (nearBottom) newMessageCount = 0;
}

function formatMessageTime(value: number): string {
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(value);
}

function formatSyncStatus(): string {
	if (isOffline) return "离线";
	if (syncing) return "同步中";
	if (syncError) return "同步失败";
	if (!lastSyncedAt) return "等待同步";
	return `同步于 ${new Intl.DateTimeFormat("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(lastSyncedAt)}`;
}

function dateKey(value: number): string {
	return new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(value);
}

function dateLabel(value: number): string {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (dateKey(value) === dateKey(today.getTime())) return "今天";
	if (dateKey(value) === dateKey(yesterday.getTime())) return "昨天";
	return dateKey(value);
}

function shouldShowDate(index: number): boolean {
	return (
		index === 0 ||
		dateKey(messages[index - 1].createdAt) !==
			dateKey(messages[index].createdAt)
	);
}

function validateMessageBody(content: string): string {
	const textLength = getMomentTextLength(content);
	if (textLength < MIN_MESSAGE_LENGTH && !hasMomentImage(content)) {
		return `消息至少需要 ${MIN_MESSAGE_LENGTH} 个字符`;
	}
	if (textLength > MAX_MESSAGE_LENGTH) {
		return `消息不能超过 ${MAX_MESSAGE_LENGTH} 个字符`;
	}
	return "";
}

function validateComposer(content: string): string {
	if (loginMode === "force" && !authUser) return "请先登录后再发送消息";
	if (!authUser && profile.nick.trim().length < 2) {
		return profile.nick.trim()
			? "游客昵称至少需要 2 个字符"
			: loginMode === "disable"
				? "请先通过游客访问填写资料后再发送"
				: "请选择游客访问并填写资料，或登录后发送";
	}
	if (profile.mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(profile.mail)) {
		return "邮箱格式不正确";
	}
	if (profile.link) {
		try {
			const website = new URL(profile.link);
			if (website.protocol !== "http:" && website.protocol !== "https:") {
				return "网站地址仅支持 http 或 https";
			}
		} catch {
			return "网站地址格式不正确";
		}
	}
	return validateMessageBody(content);
}

async function sendMessage(
	replaceMessageId?: string,
	attachment?: GuestbookImageAttachment,
	contentOverride?: string,
): Promise<boolean> {
	if (isSending || isOffline) return false;
	const rawContent = contentOverride ?? draft.trim();
	const content = appendMomentImage(rawContent, attachment);
	composerError = validateComposer(content);
	if (composerError) return false;

	const quote = momentQuote;
	const bodyForServer = quote ? buildMomentBody(quote, content) : content;
	const optimisticBody = content;
	const tempId = `local-${Date.now()}`;
	const senderNick = authUser?.display_name || profile.nick || "访客";
	const optimistic: MomentChatMessage = {
		id: tempId,
		nick: senderNick,
		avatar: authUser?.avatar || "",
		link: authUser?.url || profile.link.trim() || undefined,
		body: optimisticBody,
		momentQuote: quote,
		createdAt: Date.now(),
		isAdmin:
			authUser?.type === "administrator" || adminNicknames.has(senderNick),
		localState: "sending",
	};

	const retainedMessages = replaceMessageId
		? messages.filter((message) => message.id !== replaceMessageId)
		: messages;
	messages = [...retainedMessages, optimistic];
	draft = "";
	writeStoredString(localStorage, DRAFT_STORAGE_KEY, "");
	await tick();
	scrollToBottom(true);

	try {
		const response = await addComment({
			serverURL,
			lang,
			token: authUser?.token,
			comment: {
				nick: authUser?.display_name || profile.nick.trim(),
				mail: authUser?.email || profile.mail.trim() || undefined,
				link: authUser?.url || profile.link.trim() || undefined,
				comment: bodyForServer,
				ua: navigator.userAgent,
				url: CHANNEL_PATH,
			},
		});

		if (response.errno || !response.data) {
			throw new Error(response.errmsg || "消息发送失败");
		}

		messages = messages.filter((message) => message.id !== tempId);
		messages = mergeMomentMessages(messages, [
			normalizeMomentComment(response.data, adminNicknames),
		]);
		totalCount += 1;
		initialError = "";
		syncError = "";
		lastSyncedAt = Date.now();
		// 发送成功后清空引用，避免连续评论都带同一引用
		momentQuote = null;
		await tick();
		scrollToBottom(true);
		queueLatestSync();
	} catch (error) {
		handleAuthenticationError(error);
		const failureReason = getMomentErrorMessage(error) || "消息发送失败";
		messages = messages.map((message) =>
			message.id === tempId
				? { ...message, localState: "failed", failureReason }
				: message,
		);
	}
	return true;
}

async function retryMessage(message: MomentChatMessage) {
	await sendMessage(message.id, undefined, message.body);
}

function discardMessage(message: MomentChatMessage) {
	messages = messages.filter((candidate) => candidate.id !== message.id);
}

function startEditingMessage(message: MomentChatMessage) {
	if (!canManageMessage(message) || mutatingMessageId) return;
	messageActionError = null;
	editingMessageId = message.id;
	editDraft = message.body;
}

function cancelEditingMessage() {
	if (mutatingMessageId === editingMessageId) return;
	editingMessageId = null;
	editDraft = "";
	messageActionError = null;
}

async function saveEditedMessage(message: MomentChatMessage) {
	if (
		!authUser?.token ||
		!message.objectId ||
		!canManageMessage(message) ||
		mutatingMessageId
	) {
		return;
	}
	const content = editDraft.trim();
	const validationError = validateMessageBody(content);
	if (validationError) {
		messageActionError = { id: message.id, message: validationError };
		return;
	}
	if (content === message.body) {
		cancelEditingMessage();
		return;
	}

	mutatingMessageId = message.id;
	messageActionError = null;
	try {
		const rawForServer = message.momentQuote
			? buildMomentBody(message.momentQuote, content)
			: content;
		const response = await updateComment({
			serverURL,
			lang,
			token: authUser.token,
			objectId: message.objectId,
			comment: {
				comment: rawForServer,
			},
		});
		const normalized = normalizeMomentComment(response.data);
		messages = messages.map((candidate) =>
			candidate.id === message.id
				? { ...normalized, userId: normalized.userId ?? message.userId }
				: candidate,
		);
		editingMessageId = null;
		editDraft = "";
		queueLatestSync();
	} catch (error) {
		handleAuthenticationError(error);
		messageActionError = {
			id: message.id,
			message: getMomentErrorMessage(error) || "消息修改失败，请稍后重试",
		};
	} finally {
		mutatingMessageId = null;
	}
}

async function confirmDeleteMessage() {
	const target = deleteTarget;
	if (
		!target ||
		!authUser?.token ||
		!target.objectId ||
		!canManageMessage(target) ||
		mutatingMessageId
	) {
		return;
	}

	mutatingMessageId = target.id;
	messageActionError = null;
	try {
		await deleteComment({
			serverURL,
			lang,
			token: authUser.token,
			objectId: target.objectId,
		});
		messages = messages.filter((message) => message.id !== target.id);
		totalCount = Math.max(0, totalCount - 1);
		if (editingMessageId === target.id) {
			editingMessageId = null;
			editDraft = "";
		}
		mutatingMessageId = null;
		deleteTarget = null;
		if (deleteDialog?.open) deleteDialog.close();
		if (!visible) document.body.style.overflow = "";
		queueLatestSync();
	} catch (error) {
		handleAuthenticationError(error);
		messageActionError = {
			id: target.id,
			message: getMomentErrorMessage(error) || "消息删除失败，请稍后重试",
		};
	} finally {
		mutatingMessageId = null;
	}
}

async function handleLogin() {
	if (loggingIn) return;
	if (!serverURL) {
		composerError = "Waline 服务地址未配置，暂时无法登录";
		return;
	}
	loggingIn = true;
	composerError = "";

	try {
		const user = await loginWithWaline({ serverURL, lang });
		if (!isAuthUser(user)) throw new Error("登录返回信息无效，请重新登录");
		authUser = user;
		persistAuthentication(user);
		await loadInitial();
	} catch (error) {
		composerError =
			error instanceof Error && error.message
				? error.message
				: "登录失败，请稍后重试";
	} finally {
		loggingIn = false;
	}
}

async function initializeGuestbook(returnedToken: string | null) {
	if (returnedToken && loginMode !== "disable") {
		loggingIn = true;
		try {
			await restoreWalineRedirectLogin(returnedToken);
		} catch (error) {
			composerError =
				error instanceof Error && error.message
					? error.message
					: "登录信息验证失败，请重新登录";
		} finally {
			removeLoginTokenFromURL();
			loggingIn = false;
		}
	} else if (returnedToken) {
		removeLoginTokenFromURL();
	}

	if (isOffline) {
		initialLoading = false;
		initialError = "当前处于离线状态，恢复网络后将自动加载";
	} else if (document.visibilityState === "visible") {
		await loadInitial();
	} else {
		initialLoading = false;
		initialError = "页面恢复可见后将自动加载聊天室";
	}
}

function handleLogout() {
	clearAuthentication();
	void loadInitial();
}

function handleProfileChange(nextProfile: GuestbookProfile) {
	profile = nextProfile;
	writeStoredValue(localStorage, PROFILE_STORAGE_KEY, nextProfile);
	composerError = "";
}

function handleDraftChange(nextDraft: string) {
	draft = nextDraft;
	writeStoredString(localStorage, DRAFT_STORAGE_KEY, nextDraft);
	composerError = "";
}

function openModal(id: string, published: string, excerpt: string) {
	momentQuote = { id, published, excerpt };
	visible = true;
	document.body.style.overflow = "hidden";
	// 确保数据已加载
	if (messages.length === 0 && !initialLoading) void loadInitial();
	void tick().then(() => scrollToBottom(false));
}

export function open(id: string, published: string, excerpt: string) {
	openModal(id, published, excerpt);
}

function closeModal() {
	visible = false;
	sidebarOpen = false;
	document.body.style.overflow = "";
	if (announcementDialog?.open) announcementDialog.close();
	if (deleteDialog?.open) deleteDialog.close();
}

function handleOverlayKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") closeModal();
}

onMount(() => {
	const storedProfile = readStoredValue<unknown>(
		localStorage,
		PROFILE_STORAGE_KEY,
	);
	if (isProfile(storedProfile)) profile = storedProfile;
	if (loginMode === "disable") clearAuthentication();
	else authUser = readAuthentication();
	draft = readStoredString(localStorage, DRAFT_STORAGE_KEY);
	isOffline = !navigator.onLine;
	const returnedToken = new URL(window.location.href).searchParams.get("token");
	void initializeGuestbook(returnedToken);
	startPolling();
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);

	// Swup guard：跨导航单例
	const w = window as unknown as {
		__momentComment?: {
			open: (id: string, published: string, excerpt: string) => void;
			close: () => void;
		};
	};
	if (!w.__momentComment) {
		w.__momentComment = { open: openModal, close: closeModal };
	} else {
		w.__momentComment.open = openModal;
		w.__momentComment.close = closeModal;
	}

	return () => {
		if (pollTimer) window.clearInterval(pollTimer);
		dataController?.abort();
		initialMediaCleanup?.();
		if (announcementDialog?.open) announcementDialog.close();
		if (deleteDialog?.open) deleteDialog.close();
		// 不清理 window.__momentComment，保留单例供下一次挂载复用
		if (!visible) document.body.style.overflow = "";
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
	};
});
</script>

<svelte:window onkeydown={handleChatKeydown} />

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="moment-comment-modal"
		onkeydown={handleOverlayKeydown}
	>
		<button
			class="moment-comment-modal__overlay"
			type="button"
			onclick={closeModal}
			aria-label="关闭动态评论"
		></button>
		<div class="moment-comment-modal__panel" role="dialog" aria-modal="true" aria-label="动态评论">
			<section class="guestbook-chat moment-comment-chat" aria-label="动态评论">
				<header class="guestbook-chat__header">
					<div class="guestbook-chat__channel">
						<button
							class:is-syncing={syncing}
							class="guestbook-chat__mobile-channel-refresh"
							type="button"
							onclick={() => void syncLatest()}
							disabled={syncing || initialLoading || isOffline}
							aria-label={syncing ? "动态评论正在刷新" : "刷新动态评论"}
							aria-busy={syncing}
						>
							<span>动态评论</span>
							<span class:is-visible={syncing} class="guestbook-chat__mobile-refresh-icon">
								<RefreshCw size={15} aria-hidden="true" />
							</span>
						</button>
						<div class="guestbook-chat__desktop-channel-details">
							<div class="guestbook-chat__title-row">
								<h2>动态评论</h2>
								<span>· {initialLoading ? "--" : totalCount} 条评论</span>
								<div class="guestbook-chat__sync">
									<div
										class:is-failed={Boolean(syncError)}
										class="guestbook-chat__status"
										aria-live="polite"
									>
										<span class:is-offline={isOffline}></span>
										{formatSyncStatus()} · 30 s
									</div>
									<button
										class:is-syncing={syncing} class="guestbook-chat__refresh"
										type="button"
										onclick={() => void syncLatest()}
										disabled={syncing || initialLoading || isOffline}
										aria-label="立即刷新消息"
										title="立即刷新"
									>
										<RefreshCw size={17} aria-hidden="true" />
									</button>
								</div>
							</div>
						</div>
					</div>

					<div class="guestbook-chat__actions">
						<button
							class="guestbook-chat__sidebar-toggle"
							type="button"
							onclick={() => (sidebarOpen = !sidebarOpen)}
							aria-expanded={sidebarOpen}
							aria-controls="moment-comment-sidebar"
							title="群公告与聊天成员"
						>
							<Users size={18} aria-hidden="true" />
							<span>{chatMembers.length}</span>
						</button>
						<button
							class="moment-comment-chat__close"
							type="button"
							onclick={closeModal}
							aria-label="关闭"
							title="关闭"
						>
							<X size={18} aria-hidden="true" />
						</button>
					</div>
				</header>

				<div class="guestbook-chat__workspace">
					<div class="guestbook-chat__conversation">
						{#if initialLoading}
							<div
								class="guestbook-chat__loading"
								aria-label="正在加载聊天消息"
								aria-busy="true"
							>
								{#each Array(6) as _, index}
									<div class:is-admin={index % 3 === 2} class="guestbook-chat__skeleton">
										<div class="guestbook-chat__skeleton-avatar"></div>
										<div class="guestbook-chat__skeleton-copy">
											<div class="guestbook-chat__skeleton-name"></div>
											<div class="guestbook-chat__skeleton-bubble"></div>
											<div class="guestbook-chat__skeleton-meta"></div>
										</div>
									</div>
								{/each}
							</div>
						{:else if initialError && messages.length === 0}
							<div class="guestbook-chat__state" role="alert">
								<AlertCircle size={34} aria-hidden="true" />
								<h3>聊天室加载失败</h3>
								<p>{initialError}</p>
								<button type="button" onclick={() => void loadInitial()}>
									<RotateCcw size={17} aria-hidden="true" />重新加载
								</button>
							</div>
						{:else}
							<div
								class="guestbook-chat__messages custom-scrollbar"
								bind:this={messageList}
								onscroll={handleMessageScroll}
								aria-live="polite"
								aria-relevant="additions"
							>
								<div class="guestbook-chat__history">
									{#if hasMore}
										<button
											type="button"
											onclick={() => void loadOlder()}
											disabled={loadingOlder}
										>
											{#if loadingOlder}
												<LoaderCircle class="is-spinning" size={15} aria-hidden="true" />
											{/if}
											{loadingOlder ? "正在加载历史消息" : "加载更早消息"}
										</button>
									{:else if messages.length > 0}
										<span>已经到最早一条消息</span>
									{/if}
								</div>

								{#if messages.length === 0}
									<div class="guestbook-chat__empty">
										<div class="guestbook-chat__empty-mark">DC</div>
										<h3>还没有人评论</h3>
										<p>发送第一条评论，开启这段对话。</p>
									</div>
								{/if}

								{#each messages as message, index (message.id)}
									{#if shouldShowDate(index)}
										<div class="guestbook-chat__date">
											<span>{dateLabel(message.createdAt)}</span>
										</div>
									{/if}

									{#if message.momentQuote}
										<div class="moment-quote" role="note" aria-label="引用的动态">
											<span class="moment-quote__meta">{message.momentQuote.published}</span>
											<p class="moment-quote__excerpt">{message.momentQuote.excerpt}</p>
										</div>
									{/if}

									<GuestbookChatMessage
										message={message as unknown as import("@/types/guestbook-chat").GuestbookChatMessage}
										timeLabel={formatMessageTime(message.createdAt)}
										canManage={canManageMessage(message)}
										isEditing={editingMessageId === message.id}
										isMutating={mutatingMessageId === message.id}
										{editDraft}
										actionError={messageActionError?.id === message.id
											? messageActionError.message
											: undefined}
										onReply={() => {}}
										onEdit={startEditingMessage as unknown as (m: import("@/types/guestbook-chat").GuestbookChatMessage) => void}
										onEditDraftChange={(value) => (editDraft = value)}
										onEditCancel={cancelEditingMessage}
										onEditSave={(target) => void saveEditedMessage(target as unknown as MomentChatMessage)}
										onDelete={(target) => void requestDeleteMessage(target as unknown as MomentChatMessage)}
										onJump={() => {}}
										onRetry={(target) => void retryMessage(target as unknown as MomentChatMessage)}
										onDiscard={(target) => discardMessage(target as unknown as MomentChatMessage)}
										onCopyError={(errorText) => {
											messageActionError = { id: message.id, message: errorText };
										}}
									/>
								{/each}
							</div>
						{/if}

						<div class="guestbook-chat__composer-area">
							{#if !initialLoading && !initialError && (showScrollToBottom || newMessageCount > 0)}
								<button
									class="guestbook-chat__new-messages"
									type="button"
									onclick={() => scrollToBottom(true)}
									aria-label={newMessageCount > 0
										? `${newMessageCount} 条新消息，回到最新消息`
										: "回到底部"}
								>
									<ChevronDown size={20} aria-hidden="true" />
								</button>
							{/if}

							{#if syncError || isOffline}
								<div class="guestbook-chat__sync-error" role="status">
									<WifiOff size={15} aria-hidden="true" />
									<span>{syncError || "当前处于离线状态"}</span>
									{#if !isOffline}
										<button type="button" onclick={() => void syncLatest()}>重试同步</button>
									{/if}
								</div>
							{/if}

							{#if momentQuote}
								<div class="guestbook-composer__reply" role="note" aria-label="引用的动态">
									<div>
										<span>引用动态 · {momentQuote.published}</span>
										<small>{momentQuote.excerpt}</small>
									</div>
									<button type="button" onclick={() => (momentQuote = null)} aria-label="取消引用" title="取消引用">
										<X size={18} aria-hidden="true" />
									</button>
								</div>
							{/if}

							<GuestbookChatComposer
								{profile}
								{authUser}
								{draft}
								replyTarget={null}
								{composerError}
								{isOffline}
								{isSending}
								{loggingIn}
								{loginMode}
								onProfileChange={handleProfileChange}
								onDraftChange={handleDraftChange}
								onReplyCancel={() => (momentQuote = null)}
								onLogin={() => void handleLogin()}
								onLogout={handleLogout}
								onSend={(content, attachment) =>
									sendMessage(undefined, attachment, content)}
								onToolError={(message) => (composerError = message)}
							/>
						</div>
					</div>

					{#if sidebarOpen}
						<button
							class="guestbook-chat__sidebar-overlay"
							type="button"
							onclick={() => (sidebarOpen = false)}
							aria-label="关闭群信息"
						></button>
					{/if}

					<aside
						id="moment-comment-sidebar"
						class:is-open={sidebarOpen}
						class="guestbook-chat__sidebar"
						aria-label="群信息"
					>
						<div class="guestbook-chat__sidebar-heading">
							<strong>群信息</strong>
							<button
								type="button"
								onclick={() => (sidebarOpen = false)}
								aria-label="关闭群信息"
							>
								<X size={18} aria-hidden="true" />
							</button>
						</div>

						<section class="guestbook-chat__announcement-panel" aria-label="群公告">
							<div class="guestbook-chat__panel-title">
								<Bell size={16} aria-hidden="true" />群公告
							</div>
							{#each announcements as announcement}
								<button
									class="guestbook-chat__announcement"
									type="button"
									onclick={() => void openAnnouncement(announcement)}
								>
									<span>
										<strong>{announcement.title}</strong>
										<ChevronRight size={16} aria-hidden="true" />
									</span>
									<p>{announcement.summary}</p>
								</button>
							{/each}
						</section>

						<section class="guestbook-chat__members" aria-label="聊天成员">
							<div class="guestbook-chat__panel-title">
								<Users size={16} aria-hidden="true" />聊天成员 <span>{chatMembers.length}</span>
							</div>
							<div class="guestbook-chat__member-list custom-scrollbar">
								{#each chatMembers as member (`${member.nick}-${member.avatar}`)}
									{#if member.link}
										<a
											class="guestbook-chat__member"
											href={member.link}
											target="_blank"
											rel="nofollow noopener noreferrer"
										>
											<span class="guestbook-chat__member-avatar">
												<span>{getMomentInitials(member.nick)}</span>
												{#if member.avatar}<img src={member.avatar} alt="" loading="lazy" />{/if}
											</span>
											<span>{member.nick}</span>
											{#if member.isAdmin}<small>站长</small>{/if}
										</a>
									{:else}
										<div class="guestbook-chat__member">
											<span class="guestbook-chat__member-avatar">
												<span>{getMomentInitials(member.nick)}</span>
												{#if member.avatar}<img src={member.avatar} alt="" loading="lazy" />{/if}
											</span>
											<span>{member.nick}</span>
											{#if member.isAdmin}<small>站长</small>{/if}
										</div>
									{/if}
								{/each}
							</div>
						</section>
					</aside>
				</div>

				<dialog
					bind:this={announcementDialog}
					class="privacy-modal guestbook-announcement-modal"
					aria-labelledby="moment-announcement-title"
					onclose={() => {
						if (!visible) document.body.style.overflow = "";
					}}
					oncancel={(event) => {
						event.preventDefault();
						closeAnnouncement();
					}}
				>
					<div class="privacy-overlay" role="button" tabindex="-1" onclick={closeAnnouncement} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") closeAnnouncement(); }}></div>
					{#if selectedAnnouncement}
						<div class="privacy-panel">
							<div class="privacy-header">
								<h2 id="moment-announcement-title" class="privacy-title">
									{selectedAnnouncement.title}
								</h2>
								<button
									class="privacy-close"
									type="button"
									onclick={closeAnnouncement}
									aria-label="关闭群公告"
								>
									<X size={20} aria-hidden="true" />
								</button>
							</div>
							<div class="privacy-body guestbook-announcement-modal__body custom-scrollbar">
								<p>{selectedAnnouncement.summary}</p>
								{#if selectedAnnouncement.lead}<p>{selectedAnnouncement.lead}</p>{/if}
								<ul>
									{#each selectedAnnouncement.rules as rule}
										<li>{rule}</li>
									{/each}
								</ul>
							</div>
							<div class="privacy-footer">
								<button class="privacy-confirm-btn" type="button" onclick={closeAnnouncement}>
									我知道了
								</button>
							</div>
						</div>
					{/if}
				</dialog>

				<dialog
					bind:this={deleteDialog}
					class="privacy-modal guestbook-delete-modal"
					aria-labelledby="moment-delete-title"
					onclose={() => {
						if (!visible) document.body.style.overflow = "";
						if (!mutatingMessageId) deleteTarget = null;
					}}
					oncancel={(event) => {
						event.preventDefault();
						closeDeleteDialog();
					}}
				>
					<div class="privacy-overlay" role="button" tabindex="-1" onclick={closeDeleteDialog} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") closeDeleteDialog(); }}></div>
					{#if deleteTarget}
						<div class="privacy-panel guestbook-delete-modal__panel">
							<div class="privacy-header">
								<h2 id="moment-delete-title" class="privacy-title">删除消息</h2>
								<button
									class="privacy-close"
									type="button"
									onclick={closeDeleteDialog}
									disabled={mutatingMessageId === deleteTarget.id}
									aria-label="关闭删除确认"
								>
									<X size={20} aria-hidden="true" />
								</button>
							</div>
							<div class="privacy-body guestbook-delete-modal__body">
								<p>删除后无法恢复，Waline 服务端也会同步删除这条消息。</p>
								<blockquote>{deleteTarget.body.slice(0, 160)}</blockquote>
								{#if messageActionError?.id === deleteTarget.id}
									<p class="guestbook-delete-modal__error" role="alert">
										{messageActionError.message}
									</p>
								{/if}
							</div>
							<div class="privacy-footer guestbook-delete-modal__actions">
								<button
									class="guestbook-delete-modal__cancel"
									type="button"
									onclick={closeDeleteDialog}
									disabled={mutatingMessageId === deleteTarget.id}
								>
									取消
								</button>
								<button
									class="guestbook-delete-modal__confirm"
									type="button"
									onclick={() => void confirmDeleteMessage()}
									disabled={mutatingMessageId === deleteTarget.id}
								>
									{mutatingMessageId === deleteTarget.id ? "删除中" : "确认删除"}
								</button>
							</div>
						</div>
					{/if}
				</dialog>
			</section>
		</div>
	</div>
{/if}

<style>
	@reference "../../styles/main.css";

	.moment-comment-modal {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		display: grid;
		place-items: center;
		padding: clamp(0.75rem, 2vw, 1.5rem);
	}

	.moment-comment-modal__overlay {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		background: oklch(0 0 0 / 0.42);
		backdrop-filter: blur(2px);
	}

	.moment-comment-modal__panel {
		position: relative;
		width: min(100%, 58rem);
		height: min(92dvh, 46rem);
		max-height: 92dvh;
		display: grid;
		z-index: 1;
	}

	.moment-comment-modal__panel .guestbook-chat {
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.moment-comment-chat__close {
		display: grid;
		place-items: center;
		width: var(--control-size);
		height: var(--control-size);
		border: 1px solid var(--guestbook-line);
		border-radius: var(--radius-medium);
		background: transparent;
		color: var(--deep-text);
	}

	.moment-quote {
		margin: 0 0 var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-left: 3px solid var(--primary);
		background: var(--guestbook-panel);
		border-radius: var(--radius-small);
	}

	.moment-quote__meta {
		display: block;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--guestbook-muted);
		margin-bottom: var(--space-1);
	}

	.moment-quote__excerpt {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--deep-text);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.moment-comment-modal {
			padding: 0;
			place-items: stretch;
		}

		.moment-comment-modal__panel {
			width: 100%;
			height: 100dvh;
			max-height: 100dvh;
		}

		.moment-comment-modal__panel .guestbook-chat {
			border-radius: 0;
			border-left: 0;
			border-right: 0;
		}
	}
</style>
