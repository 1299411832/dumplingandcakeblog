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
		map.get(k)!.push(e);
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
