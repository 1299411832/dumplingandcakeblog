import type {
	GuestbookChatMessage,
	GuestbookEmojiPack,
	GuestbookImageAttachment,
} from "./guestbook-chat";

export interface NotebookQuote {
	id: string;
	published: string;
	excerpt: string;
}

export interface NotebookChatMessage extends GuestbookChatMessage {
	notebookQuote?: NotebookQuote | null;
	// 兼容旧 momentQuote 字段（归档卡片透传复用）
	momentQuote?: NotebookQuote | null;
}

export type NotebookEmojiPack = GuestbookEmojiPack;
export type NotebookImageAttachment = GuestbookImageAttachment;
export type NotebookMessageLocalState = GuestbookChatMessage["localState"];
