/**
 * YAML frontmatter 工具
 * 用于生成和解析 Content Collection markdown 文件的 frontmatter
 */

// ─── 序列化 ─────────────────────────────────────────

function escapeYamlValue(val: string): string {
	// 如果包含特殊字符，用双引号包裹
	if (/[:#\n"'{}[\],&*?|>!%`@]/.test(val) || val.includes("\\") || val.trim() !== val) {
		return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	// 如果值是纯数字字符串（如 "2025"），也加引号避免被 YAML 解析为 number
	if (/^\d+$/.test(val)) return `"${val}"`;
	// 如果看起来像 boolean/null，加引号
	if (["true", "false", "null", "yes", "no", "on", "off"].includes(val.toLowerCase())) {
		return `"${val}"`;
	}
	return val;
}

/**
 * 将 frontmatter 对象和 body 合并为完整的 .md 文件内容
 */
export function stringifyFrontmatter(
	frontmatter: Record<string, unknown>,
	body: string,
): string {
	const lines: string[] = ["---"];

	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === undefined || value === null || value === "") continue;

		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			lines.push(`${key}:`);
			for (const item of value) {
				const str = String(item);
				lines.push(`  - "${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
			}
		} else if (typeof value === "boolean") {
			lines.push(`${key}: ${value}`);
		} else if (typeof value === "number") {
			lines.push(`${key}: ${value}`);
		} else if (value instanceof Date) {
			// 日期字段统一用 YYYY-MM-DD HH:mm:ss 格式
			const pad = (n: number) => String(n).padStart(2, "0");
			const dateStr = [
				value.getFullYear(),
				"-",
				pad(value.getMonth() + 1),
				"-",
				pad(value.getDate()),
				" ",
				pad(value.getHours()),
				":",
				pad(value.getMinutes()),
				":",
				pad(value.getSeconds()),
			].join("");
			const isDateOnly =
				value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0;
			lines.push(`${key}: ${isDateOnly ? dateStr.slice(0, 10) : dateStr}`);
		} else {
			const strValue = String(value);
			lines.push(`${key}: ${escapeYamlValue(strValue)}`);
		}
	}

	lines.push("---");
	if (body) {
		lines.push("");
		lines.push(body);
	}

	return lines.join("\n") + "\n";
}

// ─── 解析 ───────────────────────────────────────────

export interface ParsedContent {
	frontmatter: Record<string, unknown>;
	body: string;
}

/**
 * 解析 .md 文件，分离 frontmatter 和 body
 */
export function parseFrontmatter(raw: string): ParsedContent {
	const result: ParsedContent = {
		frontmatter: {},
		body: "",
	};

	const lines = raw.split("\n");

	// 找 frontmatter 边界
	if (lines[0]?.trim() !== "---") {
		result.body = raw;
		return result;
	}

	let endLine = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			endLine = i;
			break;
		}
	}

	if (endLine === -1) {
		result.body = raw;
		return result;
	}

	const fmLines = lines.slice(1, endLine);
	const bodyLines = lines.slice(endLine + 1);

	// 移除 body 开头的空行
	while (bodyLines.length > 0 && bodyLines[0].trim() === "") {
		bodyLines.shift();
	}
	result.body = bodyLines.join("\n").trimEnd();

	// 解析 YAML 行
	let currentKey = "";
	let isArrayVal = false;
	const arrayValues: string[] = [];

	for (const line of fmLines) {
		// 数组项 `  - "value"`
		const arrayMatch = line.match(/^  -\s+(.+)$/);
		if (arrayMatch && isArrayVal && currentKey) {
			let val = arrayMatch[1].trim();
			// 去除引号
			if (
				(val.startsWith('"') && val.endsWith('"')) ||
				(val.startsWith("'") && val.endsWith("'"))
			) {
				val = val.slice(1, -1).replace(/\\"/g, '"');
			}
			arrayValues.push(val);
			continue;
		}

		// 遇到新 key 时，先保存之前的数组
		if (isArrayVal && currentKey) {
			result.frontmatter[currentKey] = [...arrayValues];
			arrayValues.length = 0;
			isArrayVal = false;
			currentKey = "";
		}

		// 空行或注释跳过
		if (!line.trim() || line.trim().startsWith("#")) continue;

		// key: value
		const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
		if (!kvMatch) continue;

		const key = kvMatch[1];
		const rawVal = kvMatch[2]?.trim() ?? "";

		// 空值 = 数组开始标记
		if (rawVal === "") {
			currentKey = key;
			isArrayVal = true;
			arrayValues.length = 0;
			continue;
		}

		// 解析值
		let parsedVal: unknown = rawVal;

		// 布尔
		if (rawVal === "true") parsedVal = true;
		else if (rawVal === "false") parsedVal = false;
		// 整数
		else if (/^-?\d+$/.test(rawVal)) parsedVal = Number.parseInt(rawVal, 10);
		// 浮点
		else if (/^-?\d+\.\d+$/.test(rawVal)) parsedVal = Number.parseFloat(rawVal);
		// 字符串（去引号）
		else if (
			(rawVal.startsWith('"') && rawVal.endsWith('"')) ||
			(rawVal.startsWith("'") && rawVal.endsWith("'"))
		) {
			parsedVal = rawVal.slice(1, -1).replace(/\\"/g, '"');
		}

		result.frontmatter[key] = parsedVal;
	}

	// 收尾数组
	if (isArrayVal && currentKey) {
		result.frontmatter[currentKey] = [...arrayValues];
	}

	return result;
}
