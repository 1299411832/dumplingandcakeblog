/**
 * Content Collection 文件读写抽象层
 *
 * DEV 模式：直接操作文件系统 (src/content/)
 * Vercel 生产：通过 GitHub Contents API 提交到仓库
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";

// ═══════════════════════════════════════════════════
// 环境检测
// ═══════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const ROOT = process.cwd();

export function isDev(): boolean {
	return import.meta.env.DEV;
}

// ═══════════════════════════════════════════════════
// GitHub API 配置
// ═══════════════════════════════════════════════════

function getGitHubConfig() {
	const token = import.meta.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
	const owner = import.meta.env.GITHUB_REPO_OWNER || process.env.GITHUB_REPO_OWNER || "";
	const repo = import.meta.env.GITHUB_REPO_NAME || process.env.GITHUB_REPO_NAME || "";
	const branch = import.meta.env.GITHUB_REPO_BRANCH || process.env.GITHUB_REPO_BRANCH || "main";
	return { token, owner, repo, branch };
}

// ═══════════════════════════════════════════════════
// 通用响应
// ═══════════════════════════════════════════════════

export interface WriteResult {
	success: boolean;
	error?: string;
}

export interface ReadResult {
	success: boolean;
	data?: Array<{
		filePath: string;
		filename: string;
		frontmatter: Record<string, unknown>;
		body: string;
	}>;
	error?: string;
}

export interface FileInfo {
	filePath: string;
	filename: string;
	frontmatter: Record<string, unknown>;
	body: string;
}

// ═══════════════════════════════════════════════════
// GitHub Contents API
// ═══════════════════════════════════════════════════

async function githubApi(
	apiPath: string,
	options: RequestInit = {},
): Promise<Response> {
	const { token } = getGitHubConfig();
	return fetch(`https://api.github.com${apiPath}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...options.headers,
		},
	});
}

/** 获取单个文件的 content 和 sha */
async function githubGetFile(
	contentPath: string,
): Promise<{ content: string; sha: string } | null> {
	const { owner, repo, branch } = getGitHubConfig();
	// contentPath 相对于仓库根目录，如 "src/content/moments/2026-08-02.md"
	const url = `/repos/${owner}/${repo}/contents/${encodeURI(contentPath)}?ref=${branch}`;
	const resp = await githubApi(url);
	if (resp.status === 404) return null;
	if (!resp.ok) {
		console.error(`[content-writer] GitHub GET ${contentPath}: HTTP ${resp.status}`);
		return null;
	}
	const data = (await resp.json()) as {
		content?: string;
		sha?: string;
		encoding?: string;
	};
	if (data.content && data.encoding === "base64") {
		return {
			content: Buffer.from(data.content, "base64").toString("utf-8"),
			sha: data.sha || "",
		};
	}
	return null;
}

/** 写入文件到 GitHub */
async function githubWriteFile(
	contentPath: string,
	content: string,
	message: string,
	sha?: string,
): Promise<WriteResult> {
	const { owner, repo, branch } = getGitHubConfig();
	const url = `/repos/${owner}/${repo}/contents/${encodeURI(contentPath)}`;

	const body: Record<string, unknown> = {
		message,
		content: Buffer.from(content, "utf-8").toString("base64"),
		branch,
	};
	if (sha) body.sha = sha;

	const resp = await githubApi(url, {
		method: "PUT",
		body: JSON.stringify(body),
	});

	if (!resp.ok) {
		const errBody = await resp.text();
		console.error(`[content-writer] GitHub PUT ${contentPath}: HTTP ${resp.status} ${errBody.slice(0, 200)}`);
		return { success: false, error: `GitHub API 错误 (${resp.status})` };
	}
	return { success: true };
}

/** 删除文件 */
async function githubDeleteFile(
	contentPath: string,
	message: string,
	sha: string,
): Promise<WriteResult> {
	const { owner, repo, branch } = getGitHubConfig();
	const url = `/repos/${owner}/${repo}/contents/${encodeURI(contentPath)}`;

	const resp = await githubApi(url, {
		method: "DELETE",
		body: JSON.stringify({ message, sha, branch }),
	});

	if (!resp.ok) {
		const errBody = await resp.text();
		console.error(`[content-writer] GitHub DELETE ${contentPath}: HTTP ${resp.status} ${errBody.slice(0, 200)}`);
		return { success: false, error: `GitHub API 错误 (${resp.status})` };
	}
	return { success: true };
}

// ═══════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════

/**
 * 读取目录下所有 .md 文件，解析 frontmatter
 * dirRelPath: 相对于仓库根目录的路径，如 "src/content/moments"
 */
export async function readContentDir(dirRelPath: string): Promise<ReadResult> {
	const absPath = path.join(ROOT, dirRelPath);

	if (isDev()) {
		try {
			if (!fs.existsSync(absPath)) {
				return { success: true, data: [] };
			}
			const entries = fs.readdirSync(absPath, { withFileTypes: true });
			const files: FileInfo[] = [];

			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
				const filePath = path.join(absPath, entry.name);
				const raw = fs.readFileSync(filePath, "utf-8");
				const parsed = parseFrontmatter(raw);
				files.push({
					filePath: path.join(dirRelPath, entry.name),
					filename: entry.name,
					frontmatter: parsed.frontmatter,
					body: parsed.body,
				});
			}
			return { success: true, data: files };
		} catch (e) {
			return { success: false, error: String(e) };
		}
	}

	// Vercel: 通过 GitHub API 获取目录内容
	const { owner, repo, branch } = getGitHubConfig();
	const url = `/repos/${owner}/${repo}/contents/${encodeURI(dirRelPath)}?ref=${branch}`;
	const resp = await githubApi(url);

	if (resp.status === 404) {
		return { success: true, data: [] };
	}

	if (!resp.ok) {
		return { success: false, error: `GitHub API 错误 (${resp.status})` };
	}

	const listing = (await resp.json()) as Array<{
		name: string;
		type: string;
	}>;
	const files: FileInfo[] = [];

	for (const item of listing) {
		if (item.type !== "file" || !item.name.endsWith(".md")) continue;
		const fileResult = await githubGetFile(`${dirRelPath}/${item.name}`);
		if (!fileResult) continue;
		const parsed = parseFrontmatter(fileResult.content);
		files.push({
			filePath: `${dirRelPath}/${item.name}`,
			filename: item.name,
			frontmatter: parsed.frontmatter,
			body: parsed.body,
		});
	}

	return { success: true, data: files };
}

/**
 * 读取单个文件
 */
export async function readSingleFile(
	fileRelPath: string,
): Promise<{ content: string; sha?: string } | null> {
	const absPath = path.join(ROOT, fileRelPath);

	if (isDev()) {
		try {
			if (!fs.existsSync(absPath)) return null;
			const content = fs.readFileSync(absPath, "utf-8");
			return { content };
		} catch {
			return null;
		}
	}

	return githubGetFile(fileRelPath);
}

/**
 * 写入文件到 Content Collection
 * fileRelPath: 相对于仓库根目录的路径
 */
export async function writeContentFile(
	fileRelPath: string,
	frontmatter: Record<string, unknown>,
	body: string,
): Promise<WriteResult> {
	const content = stringifyFrontmatter(frontmatter, body);
	const absPath = path.join(ROOT, fileRelPath);

	if (isDev()) {
		try {
			fs.mkdirSync(path.dirname(absPath), { recursive: true });
			fs.writeFileSync(absPath, content, "utf-8");
			return { success: true };
		} catch (e) {
			return { success: false, error: String(e) };
		}
	}

	// Vercel: 检查是否已存在（更新需要 sha）
	const existing = await githubGetFile(fileRelPath);
	const message = existing
		? `admin: update ${path.basename(fileRelPath)}`
		: `admin: create ${path.basename(fileRelPath)}`;

	return githubWriteFile(fileRelPath, content, message, existing?.sha);
}

/**
 * 删除 Content Collection 文件
 */
export async function deleteContentFile(
	fileRelPath: string,
): Promise<WriteResult> {
	const absPath = path.join(ROOT, fileRelPath);

	if (isDev()) {
		try {
			if (fs.existsSync(absPath)) {
				fs.unlinkSync(absPath);
			}
			return { success: true };
		} catch (e) {
			return { success: false, error: String(e) };
		}
	}

	// Vercel: 先获取 sha
	const existing = await githubGetFile(fileRelPath);
	if (!existing) {
		return { success: false, error: "文件不存在" };
	}

	return githubDeleteFile(
		fileRelPath,
		`admin: delete ${path.basename(fileRelPath)}`,
		existing.sha,
	);
}

/**
 * 递归读取目录（用于 bangumi 等有子目录的集合）
 */
export async function readContentDirRecursive(
	dirRelPath: string,
): Promise<ReadResult> {
	const absPath = path.join(ROOT, dirRelPath);

	if (isDev()) {
		try {
			if (!fs.existsSync(absPath)) {
				return { success: true, data: [] };
			}

			const files: FileInfo[] = [];
			const walkDir = (currentPath: string, relBase: string) => {
				const entries = fs.readdirSync(currentPath, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(currentPath, entry.name);
					const relPath = path.join(relBase, entry.name);
					if (entry.isDirectory()) {
						walkDir(fullPath, relPath);
					} else if (entry.isFile() && entry.name.endsWith(".md")) {
						const raw = fs.readFileSync(fullPath, "utf-8");
						const parsed = parseFrontmatter(raw);
						files.push({
							filePath: relPath,
							filename: entry.name,
							frontmatter: parsed.frontmatter,
							body: parsed.body,
						});
					}
				}
			};
			walkDir(absPath, dirRelPath);
			return { success: true, data: files };
		} catch (e) {
			return { success: false, error: String(e) };
		}
	}

	// Vercel: 递归获取（Bangumi 目录结构较浅，两层即可）
	const { owner, repo, branch } = getGitHubConfig();
	const files: FileInfo[] = [];

	async function walkGitHub(relPath: string) {
		const url = `/repos/${owner}/${repo}/contents/${encodeURI(relPath)}?ref=${branch}`;
		const resp = await githubApi(url);
		if (resp.status === 404) return;
		if (!resp.ok) return;

		const listing = (await resp.json()) as Array<{ name: string; type: string }>;
		for (const item of listing) {
			const itemPath = `${relPath}/${item.name}`;
			if (item.type === "dir") {
				await walkGitHub(itemPath);
			} else if (item.type === "file" && item.name.endsWith(".md")) {
				const fileResult = await githubGetFile(itemPath);
				if (!fileResult) continue;
				const parsed = parseFrontmatter(fileResult.content);
				files.push({
					filePath: itemPath,
					filename: item.name,
					frontmatter: parsed.frontmatter,
					body: parsed.body,
				});
			}
		}
	}

	await walkGitHub(dirRelPath);
	return { success: true, data: files };
}

/**
 * 读取目录下的子目录名（用于 notebooks 列表）
 */
export async function readSubdirs(dirRelPath: string): Promise<string[]> {
	const absPath = path.join(ROOT, dirRelPath);

	if (isDev()) {
		try {
			if (!fs.existsSync(absPath)) return [];
			return fs
				.readdirSync(absPath, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name);
		} catch {
			return [];
		}
	}

	// Vercel
	const { owner, repo, branch } = getGitHubConfig();
	const url = `/repos/${owner}/${repo}/contents/${encodeURI(dirRelPath)}?ref=${branch}`;
	const resp = await githubApi(url);
	if (resp.status === 404 || !resp.ok) return [];

	const listing = (await resp.json()) as Array<{ name: string; type: string }>;
	return listing
		.filter((item) => item.type === "dir")
		.map((item) => item.name);
}
