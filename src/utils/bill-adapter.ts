import type { CollectionEntry } from "astro:content";

export type BillEntry = CollectionEntry<"bills">;

function toDateKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function groupBillsByDay(
	entries: BillEntry[],
): Map<string, BillEntry[]> {
	const map = new Map<string, BillEntry[]>();
	const sorted = [...entries].sort(
		(a, b) => b.data.date.getTime() - a.data.date.getTime(),
	);
	for (const e of sorted) {
		const k = toDateKey(e.data.date);
		if (!map.has(k)) map.set(k, []);
		map.get(k)?.push(e);
	}
	return map;
}

export function calcBillStats(entries: BillEntry[]): {
	income: number;
	expense: number;
	balance: number;
	asset: number;
	liability: number;
	netAsset: number;
} {
	let income = 0;
	let expense = 0;
	for (const e of entries) {
		if (e.data.type === "income") income += e.data.amount;
		else if (e.data.type === "expense") expense += Math.abs(e.data.amount);
		else {
			if (e.data.amount > 0) income += e.data.amount;
			else expense += Math.abs(e.data.amount);
		}
	}
	const balance = income - expense;
	// Phase1 简化：资产/负债按账户名粗分，负债关键字匹配
	const liabilityKeys = ["花呗", "借呗", "信用卡", "负债"];
	let liability = 0;
	for (const e of entries) {
		if (
			liabilityKeys.some((k) => e.data.account.includes(k)) &&
			e.data.amount < 0
		) {
			liability += Math.abs(e.data.amount);
		}
	}
	const asset = income;
	const netAsset = asset - liability;
	return { income, expense, balance, asset, liability, netAsset };
}

export function billsByCategory(entries: BillEntry[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const e of entries) {
		const k = e.data.category || "其他";
		map.set(k, (map.get(k) || 0) + Math.abs(e.data.amount));
	}
	return map;
}

export function monthlyTrend(
	entries: BillEntry[],
	months = 6,
): { month: string; balance: number }[] {
	const now = new Date();
	const result: { month: string; balance: number }[] = [];
	for (let i = months - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		const inMonth = entries.filter((e) => {
			const dd = e.data.date;
			return (
				dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth()
			);
		});
		let inc = 0;
		let exp = 0;
		for (const e of inMonth) {
			if (e.data.type === "income") inc += e.data.amount;
			else exp += Math.abs(e.data.amount);
		}
		result.push({ month: key, balance: inc - exp });
	}
	return result;
}

export function calcPeriodIncomeExpense(
	entries: BillEntry[],
	start: Date,
	end: Date,
): { income: number; expense: number; count: number } {
	let income = 0;
	let expense = 0;
	let count = 0;
	for (const e of entries) {
		const d = e.data.date;
		if (d >= start && d <= end) {
			count++;
			if (e.data.type === "income") income += e.data.amount;
			else if (e.data.type === "expense") expense += Math.abs(e.data.amount);
			else {
				if (e.data.amount > 0) income += e.data.amount;
				else expense += Math.abs(e.data.amount);
			}
		}
	}
	return { income, expense, count };
}

export function getTodayMonthYearStats(entries: BillEntry[], now: Date = new Date()): {
	today: { income: number; expense: number; count: number; label: string };
	month: { income: number; expense: number; count: number; label: string };
	year: { income: number; expense: number; count: number; label: string };
} {
	const y = now.getFullYear();
	const m = now.getMonth();
	const d = now.getDate();
	const todayStart = new Date(y, m, d, 0, 0, 0);
	const todayEnd = new Date(y, m, d, 23, 59, 59);
	const monthStart = new Date(y, m, 1, 0, 0, 0);
	const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
	const yearStart = new Date(y, 0, 1, 0, 0, 0);
	const yearEnd = new Date(y, 11, 31, 23, 59, 59);
	const fmtMonth = `${String(m + 1).padStart(2, "0")}月01日-${String(m + 1).padStart(2, "0")}月${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}日`;
	return {
		today: { ...calcPeriodIncomeExpense(entries, todayStart, todayEnd), label: `${y}年${String(m + 1).padStart(2, "0")}月${String(d).padStart(2, "0")}日` },
		month: { ...calcPeriodIncomeExpense(entries, monthStart, monthEnd), label: fmtMonth },
		year: { ...calcPeriodIncomeExpense(entries, yearStart, yearEnd), label: `${y}年` },
	};
}

export function dailyIncomeExpense(
	entries: BillEntry[],
	year: number,
	month: number,
): { day: string; income: number; expense: number }[] {
	const days = new Date(year, month, 0).getDate();
	const result: { day: string; income: number; expense: number }[] = [];
	for (let d = 1; d <= days; d++) {
		const start = new Date(year, month - 1, d, 0, 0, 0);
		const end = new Date(year, month - 1, d, 23, 59, 59);
		const { income, expense } = calcPeriodIncomeExpense(entries, start, end);
		result.push({ day: `${String(month).padStart(2, "0")}.${String(d).padStart(2, "0")}`, income, expense });
	}
	return result;
}

export function categoryExpenseRank(
	entries: BillEntry[],
	year: number,
	month: number,
	limit = 3,
): { category: string; amount: number; count: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const map = new Map<string, { amount: number; count: number }>();
	for (const e of entries) {
		if (e.data.date < start || e.data.date > end) continue;
		if (e.data.type !== "expense" && e.data.amount > 0) continue;
		const k = e.data.category || "其他";
		const cur = map.get(k) || { amount: 0, count: 0 };
		cur.amount += Math.abs(e.data.amount);
		cur.count++;
		map.set(k, cur);
	}
	return [...map.entries()]
		.map(([category, v]) => ({ category, ...v }))
		.sort((a, b) => b.amount - a.amount)
		.slice(0, limit);
}

export function categoryIncomeList(
	entries: BillEntry[],
	year: number,
	month: number,
): { category: string; amount: number; count: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const map = new Map<string, { amount: number; count: number }>();
	for (const e of entries) {
		if (e.data.date < start || e.data.date > end) continue;
		if (e.data.type !== "income" && e.data.amount < 0) continue;
		if (e.data.type === "expense") continue;
		const k = e.data.category || "其他";
		const cur = map.get(k) || { amount: 0, count: 0 };
		// income amount is positive
		cur.amount += e.data.amount > 0 ? e.data.amount : Math.abs(e.data.amount);
		cur.count++;
		map.set(k, cur);
	}
	// 固定展示职业/人情/其他，若无数据则补 0
	const fixed = ["职业收入", "人情收礼", "其他收入"];
	const result: { category: string; amount: number; count: number }[] = [];
	for (const cat of fixed) {
		const v = map.get(cat) || { amount: 0, count: 0 };
		// 兼容旧分类“工资”映射到职业收入
		if (cat === "职业收入" && !map.has(cat) && map.has("工资")) {
			const w = map.get("工资")!;
			result.push({ category: cat, amount: w.amount, count: w.count });
		} else {
			result.push({ category: cat, ...v });
		}
	}
	return result;
}

export function memberMonthlyStats(
	entries: BillEntry[],
	year: number,
	month: number,
): { name: string; role: string; income: number; expense: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const filtered = entries.filter((e) => e.data.date >= start && e.data.date <= end);
	// 以 account 作为成员维度，取前 3
	const map = new Map<string, { income: number; expense: number }>();
	for (const e of filtered) {
		const k = e.data.account || "本人";
		const cur = map.get(k) || { income: 0, expense: 0 };
		if (e.data.type === "income") cur.income += e.data.amount;
		else cur.expense += Math.abs(e.data.amount);
		map.set(k, cur);
	}
	const list = [...map.entries()].map(([name, v]) => ({ name, role: "成员", ...v }));
	// 若不足 3，补“本人/朋友/176****0659”占位（与图中一致，0.00）
	const placeholders = [
		{ name: "176****0659", role: "成员" },
		{ name: "朋友", role: "成员" },
		{ name: "本人", role: "成员" },
	];
	while (list.length < 3) {
		const p = placeholders[list.length];
		if (!list.find((x) => x.name === p.name)) list.push({ ...p, income: 0, expense: 0 });
		else break;
	}
	return list.slice(0, 3);
}
