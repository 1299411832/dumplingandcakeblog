import type { CollectionEntry } from "astro:content";

export type ScheduleEntry = CollectionEntry<"schedules">;

function toDateKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function groupSchedulesByDay(
	entries: ScheduleEntry[],
): Map<string, ScheduleEntry[]> {
	const map = new Map<string, ScheduleEntry[]>();
	const sorted = [...entries].sort(
		(a, b) => a.data.date.getTime() - b.data.date.getTime(),
	);
	for (const e of sorted) {
		const k = toDateKey(e.data.date);
		if (!map.has(k)) map.set(k, []);
		map.get(k)!.push(e);
	}
	return map;
}

export function calendarMarks(
	entries: ScheduleEntry[],
	year: number,
	month: number,
): Set<string> {
	// month 1-12
	const set = new Set<string>();
	for (const e of entries) {
		const d = e.data.date;
		if (d.getFullYear() === year && d.getMonth() + 1 === month)
			set.add(toDateKey(d));
	}
	return set;
}
