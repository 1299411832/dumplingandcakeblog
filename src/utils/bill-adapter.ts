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

const LIABILITY_KEYS = [
	"花呗",
	"借呗",
	"信用卡",
	"负债",
	"白条",
	"分期",
	"借贷",
];

function isLiabilityLike(e: BillEntry): boolean {
	return LIABILITY_KEYS.some(
		(k) => e.data.account.includes(k) || e.data.category.includes(k),
	);
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
	let liability = 0;
	for (const e of entries) {
		const { type, amount } = e.data;
		if (type === "liability") {
			// 正数=新增负债/借入，负数=还款（直接减少负债），兼容旧数据 amount 可能为负的表示
			liability += amount;
		} else if (type === "income") {
			income += amount;
		} else if (type === "expense") {
			// 兼容旧数据：若账户/分类命中负债关键字，视为负债而非现金支出，避免与 liability 重复扣减
			if (isLiabilityLike(e)) {
				liability += Math.abs(amount);
			} else {
				expense += Math.abs(amount);
			}
		} else if (type === "transfer") {
		} else {
			if (amount > 0) income += amount;
			else expense += Math.abs(amount);
		}
	}
	// 负债还款后可能为负（多还），展示时归零，净资产按实际负债扣减
	const liabilityDisplay = Math.max(0, liability);
	const balance = income - expense;
	const asset = income;
	// 净资产 = 现金结余 - 负债（还款后负债减少，净资产回升；借入会使负债增加，净资产下降，若借入同时有现金流入需另记 income，此处保持简单可解释）
	const netAsset = balance - liabilityDisplay;
	return {
		income,
		expense,
		balance,
		asset,
		liability: liabilityDisplay,
		netAsset,
	};
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
			else if (e.data.type === "expense" && !isLiabilityLike(e))
				exp += Math.abs(e.data.amount);
			else if (e.data.type === "liability" || e.data.type === "transfer")
				continue;
			else if (e.data.amount < 0) exp += Math.abs(e.data.amount);
			else inc += e.data.amount;
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
			if (e.data.type === "liability" || e.data.type === "transfer") continue;
			if (e.data.type === "expense" && isLiabilityLike(e)) continue;
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

export function getTodayMonthYearStats(
	entries: BillEntry[],
	now: Date = new Date(),
): {
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
		today: {
			...calcPeriodIncomeExpense(entries, todayStart, todayEnd),
			label: `${y}年${String(m + 1).padStart(2, "0")}月${String(d).padStart(2, "0")}日`,
		},
		month: {
			...calcPeriodIncomeExpense(entries, monthStart, monthEnd),
			label: fmtMonth,
		},
		year: {
			...calcPeriodIncomeExpense(entries, yearStart, yearEnd),
			label: `${y}年`,
		},
	};
}

export function yearlyMonthlyFlow(
	entries: BillEntry[],
	year: number,
): { month: string; income: number; expense: number; balance: number }[] {
	const result: {
		month: string;
		income: number;
		expense: number;
		balance: number;
	}[] = [];
	for (let m = 1; m <= 12; m++) {
		const start = new Date(year, m - 1, 1, 0, 0, 0);
		const end = new Date(year, m, 0, 23, 59, 59);
		const { income, expense } = calcPeriodIncomeExpense(entries, start, end);
		result.push({
			month: `${String(m).padStart(2, "0")}月`,
			income,
			expense,
			balance: income - expense,
		});
	}
	return result;
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
		result.push({
			day: `${String(month).padStart(2, "0")}.${String(d).padStart(2, "0")}`,
			income,
			expense,
		});
	}
	return result;
}

export function categoryExpenseRank(
	entries: BillEntry[],
	year: number,
	month: number,
	limit = 100,
): { category: string; amount: number; count: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const map = new Map<string, { amount: number; count: number }>();
	for (const e of entries) {
		if (e.data.date < start || e.data.date > end) continue;
		if (e.data.type === "liability" || e.data.type === "transfer") continue;
		if (e.data.type !== "expense" && e.data.amount > 0) continue;
		if (isLiabilityLike(e)) continue;
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
	limit = 100,
): { category: string; amount: number; count: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const map = new Map<string, { amount: number; count: number }>();
	for (const e of entries) {
		if (e.data.date < start || e.data.date > end) continue;
		if (e.data.type === "liability" || e.data.type === "transfer") continue;
		if (e.data.type !== "income" && e.data.amount < 0) continue;
		if (e.data.type === "expense") continue;
		const k = e.data.category || "其他";
		const cur = map.get(k) || { amount: 0, count: 0 };
		// income amount is positive
		cur.amount += e.data.amount > 0 ? e.data.amount : Math.abs(e.data.amount);
		cur.count++;
		map.set(k, cur);
	}
	// 兼容“工资”归入职业收入（旧数据分类）
	if (map.has("工资")) {
		const wage = map.get("工资")!;
		const cur = map.get("职业收入") || { amount: 0, count: 0 };
		cur.amount += wage.amount;
		cur.count += wage.count;
		map.set("职业收入", cur);
		map.delete("工资");
	}
	// 按金额降序取前 limit 收入分类，工资已合并
	const sorted = [...map.entries()]
		.map(([category, v]) => ({ category, ...v }))
		.sort((a, b) => b.amount - a.amount)
		.slice(0, limit);
	// 若不足 3，用固定占位补齐（保持卡片不少于 3 行，避免过空）
	if (sorted.length < 3) {
		const fixed = ["职业收入", "人情收礼", "其他收入"];
		for (const cat of fixed) {
			if (sorted.length >= 3) break;
			if (!sorted.find((r) => r.category === cat)) {
				const v = map.get(cat) || { amount: 0, count: 0 };
				sorted.push({ category: cat, ...v });
			}
		}
	}
	return sorted.slice(0, limit);
}

export function memberMonthlyStats(
	entries: BillEntry[],
	year: number,
	month: number,
): { name: string; role: string; income: number; expense: number }[] {
	const start = new Date(year, month - 1, 1, 0, 0, 0);
	const end = new Date(year, month, 0, 23, 59, 59);
	const filtered = entries.filter(
		(e) =>
			e.data.date >= start &&
			e.data.date <= end &&
			e.data.type !== "liability" &&
			e.data.type !== "transfer" &&
			!isLiabilityLike(e),
	);
	// 以 account 作为成员维度，取前 3
	const map = new Map<string, { income: number; expense: number }>();
	for (const e of filtered) {
		const k = e.data.account || "本人";
		const cur = map.get(k) || { income: 0, expense: 0 };
		if (e.data.type === "income") cur.income += e.data.amount;
		else cur.expense += Math.abs(e.data.amount);
		map.set(k, cur);
	}
	const list = [...map.entries()].map(([name, v]) => ({
		name,
		role: "成员",
		...v,
	}));
	// 若不足 3，补“本人/朋友/176****0659”占位（与图中一致，0.00）
	const placeholders = [
		{ name: "176****0659", role: "成员" },
		{ name: "朋友", role: "成员" },
		{ name: "本人", role: "成员" },
	];
	while (list.length < 3) {
		const p = placeholders[list.length];
		if (!list.find((x) => x.name === p.name))
			list.push({ ...p, income: 0, expense: 0 });
		else break;
	}
	return list.slice(0, 3);
}
