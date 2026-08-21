<script lang="ts">
import type { CollectionEntry } from "astro:content";
import { onMount } from "svelte";
import { lunarLabel } from "@/utils/lunar";

type ScheduleEntry = CollectionEntry<"schedules">;

interface Props {
	schedules: ScheduleEntry[];
	initialYear: number;
	initialMonth: number;
	initialSelected: string;
}

let { schedules, initialYear, initialMonth, initialSelected }: Props = $props();

function toDateKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function parseSchedules(raw: ScheduleEntry[]): ScheduleEntry[] {
	return raw.map((e) => {
		const dateVal = e.data.date as unknown as string | Date;
		const date = dateVal instanceof Date ? dateVal : new Date(dateVal);
		return { ...e, data: { ...e.data, date } };
	});
}

let parsed = $derived(parseSchedules(schedules));

let year = $state(initialYear);
let month = $state(initialMonth);
let selected = $state(initialSelected);

// 从 URL 恢复（静态托管下 Astro.url 拿不到 query，需客户端校正）
function syncFromUrl(): void {
	if (typeof window === "undefined") return;
	const params = new URLSearchParams(window.location.search);
	const qy = params.get("y");
	const qm = params.get("m");
	const qd = params.get("d");
	let hasUrlMonth = false;
	if (qy && qm) {
		const y = Number.parseInt(qy);
		const m = Number.parseInt(qm);
		if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12) {
			year = y;
			month = m;
			hasUrlMonth = true;
		}
	}
	if (qd) {
		// 简单校验 YYYY-MM-DD
		if (/^\d{4}-\d{2}-\d{2}$/.test(qd)) selected = qd;
	} else if (hasUrlMonth) {
		// 切月时若 URL 没带 d，保持当前 selected 即可，不强制重置
	}
}

function pushUrl(): void {
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	url.searchParams.set("y", String(year));
	url.searchParams.set("m", String(month));
	url.searchParams.set("d", selected);
	window.history.replaceState({}, "", url.toString());
}

let eventsByDate = $derived.by(() => {
	const map = new Map<string, ScheduleEntry[]>();
	const sorted = [...parsed].sort(
		(a, b) => a.data.date.getTime() - b.data.date.getTime(),
	);
	for (const e of sorted) {
		const k = toDateKey(e.data.date);
		if (!map.has(k)) map.set(k, []);
		map.get(k)?.push(e);
	}
	return map;
});

let cells = $derived.by(() => {
	const first = new Date(year, month - 1, 1);
	const startWeek = first.getDay();
	const daysInMonth = new Date(year, month, 0).getDate();
	const prevMonthDays = new Date(year, month - 1, 0).getDate();
	const arr: { day: number; inMonth: boolean; dateStr: string }[] = [];
	for (let i = startWeek - 1; i >= 0; i--) {
		const d = prevMonthDays - i;
		const pm = month === 1 ? 12 : month - 1;
		const py = month === 1 ? year - 1 : year;
		arr.push({
			day: d,
			inMonth: false,
			dateStr: `${py}-${String(pm).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
		});
	}
	for (let d = 1; d <= daysInMonth; d++) {
		arr.push({
			day: d,
			inMonth: true,
			dateStr: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
		});
	}
	while (arr.length < 42) {
		const nextIdx = arr.length - (startWeek + daysInMonth);
		const d = nextIdx + 1;
		const nm = month === 12 ? 1 : month + 1;
		const ny = month === 12 ? year + 1 : year;
		arr.push({
			day: d,
			inMonth: false,
			dateStr: `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
		});
	}
	return arr.slice(0, 42);
});

let rows = $derived.by(() => {
	const r: (typeof cells)[] = [];
	for (let i = 0; i < cells.length; i += 7) r.push(cells.slice(i, i + 7));
	return r;
});

let todayKey = $derived.by(() => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
});

let prevYear = $derived(month === 1 ? year - 1 : year);
let prevMonth = $derived(month === 1 ? 12 : month - 1);
let nextYear = $derived(month === 12 ? year + 1 : year);
let nextMonthVal = $derived(month === 12 ? 1 : month + 1);

let allForSelected = $derived(eventsByDate.get(selected) || []);
let todaySchedules = $derived(
	allForSelected.filter((e) => e.data.category === "schedule"),
);
let todayFestivals = $derived(
	allForSelected.filter((e) => e.data.category !== "schedule"),
);

let selDate = $derived(new Date(selected + "T00:00:00"));
let dateLabel = $derived(
	`${selected} · 周${"日一二三四五六"[selDate.getDay()]}`,
);
let festivalLabel = $derived(
	todayFestivals.length
		? todayFestivals.map((e) => e.data.title).join("、")
		: "",
);

const priorityColor: Record<string, string> = {
	none: "#9ca3af",
	low: "#3b82f6",
	medium: "#f59e0b",
	high: "#ef4444",
};

function goPrev(): void {
	if (month === 1) {
		year = year - 1;
		month = 12;
	} else {
		month = month - 1;
	}
	pushUrl();
}
function goNext(): void {
	if (month === 12) {
		year = year + 1;
		month = 1;
	} else {
		month = month + 1;
	}
	pushUrl();
}
function selectDate(dateStr: string): void {
	selected = dateStr;
	// 同步切到该日所在月（避免点灰色外月日时月历不跟随）
	const d = new Date(dateStr + "T00:00:00");
	year = d.getFullYear();
	month = d.getMonth() + 1;
	pushUrl();
}

onMount(() => {
	syncFromUrl();
	const onPop = () => syncFromUrl();
	window.addEventListener("popstate", onPop);
	// Swup 导航后重新校正（静态托管下新页面仍需从 URL 取 y/m）
	const onSwup = () => syncFromUrl();
	document.addEventListener("swup:content:replaced", onSwup);
	return () => {
		window.removeEventListener("popstate", onPop);
		document.removeEventListener("swup:content:replaced", onSwup);
	};
});
</script>

<div class="schedules-inner">
	<div class="sched-cal">
		<div class="sched-cal__header">
			<button class="sched-cal__nav" type="button" aria-label="上个月" onclick={goPrev}>‹</button>
			<h2 class="sched-cal__title">{year}年 {month}月</h2>
			<button class="sched-cal__nav" type="button" aria-label="下个月" onclick={goNext}>›</button>
		</div>
		<div class="sched-cal__week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
		<div class="sched-cal__grid">
			{#each rows as row}
				<div class="sched-cal__row">
					{#each row as cell}
						{@const lunar = lunarLabel(Number.parseInt(cell.dateStr.slice(0, 4)), Number.parseInt(cell.dateStr.slice(5, 7)), cell.day)}
						{@const dayEvents = eventsByDate.get(cell.dateStr) || []}
						{@const isToday = cell.dateStr === todayKey}
						{@const isSelected = cell.dateStr === selected}
						<button
							class="sched-cal__cell"
							class:is-outside={!cell.inMonth}
							class:is-today={isToday}
							class:is-selected={isSelected}
							data-date={cell.dateStr}
							type="button"
							onclick={() => selectDate(cell.dateStr)}
						>
							<span class="sched-cal__day-row"><b class="sched-cal__day">{cell.day}</b><small class="sched-cal__lunar">{lunar}</small></span>
							<span class="sched-cal__events">
								{#each dayEvents.slice(0, 2) as e}
									<span class="sched-cal__event" class:is-holiday={e.data.category === "holiday"} class:is-birthday={e.data.category === "birthday"} title={e.data.title}>{e.data.title}</span>
								{/each}
								{#if dayEvents.length > 2}<span class="sched-cal__more">+{dayEvents.length - 2}</span>{/if}
							</span>
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<div class="schedules-below">
		<div class="schedules-panel">
			<h3 class="schedules-panel__head">今日日程 {festivalLabel ? `· ${festivalLabel}` : ""}</h3>
			<div class="sched-list">
				<h3 class="sched-list__head">{dateLabel}</h3>
				{#if todaySchedules.length === 0}
					<p class="sched-list__empty">当日无日程</p>
				{:else}
					{#each todaySchedules as e}
						<div class="sched-row" class:is-done={e.data.status === "done"}>
							<span class="sched-row__dot" style={`background:${priorityColor[e.data.priority] || "#9ca3af"}`}></span>
							<span class="sched-row__title">{e.data.title}</span>
							<span class="sched-row__time">{e.data.allDay ? "全天" : new Date(e.data.date).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
							<span class="sched-row__check">{e.data.status === "done" ? "✓" : "○"}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
		<div class="schedules-panel">
			<h3 class="schedules-panel__head">生日 · 纪念日 · 节假日</h3>
			{#if todayFestivals.length === 0}
				<p class="schedules-panel__empty">今日无生日/纪念日</p>
			{:else}
				{#each todayFestivals as e}
					<div class="sched-festival"><span class="sched-festival__tag">{e.data.category === "birthday" ? "生日" : e.data.category === "anniversary" ? "纪念日" : "节假日"}</span><span>{e.data.person ? `${e.data.person} · ` : ""}{e.data.title}</span></div>
				{/each}
			{/if}
			<div class="schedules-panel__add"><a href="/life/notebooks/">去添加</a> 或在 PagesCMS 日程中新增 类型=生日/纪念日/节假日</div>
		</div>
	</div>
</div>

<style>
@reference "../../styles/main.css";
.sched-cal{ border:1.5px solid #111; border-radius:0.85rem; overflow:hidden; background: #fff; padding:0.7rem; }
:root.dark .sched-cal{ border-color: oklch(1 0 0 / 0.18); background: oklch(0.16 0 0 / 0.86); }
.sched-cal__header{ display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.2rem 0.55rem; }
.sched-cal__title{ font-size:0.95rem; font-weight:800; }
.sched-cal__nav{ width:2rem; height:2rem; border:1.5px solid #111; border-radius:0.45rem; background:#fff; font-size:1.1rem; line-height:1; cursor:pointer; }
:root.dark .sched-cal__nav{ border-color: oklch(1 0 0 / 0.18); background: transparent; color:#fff; }
.sched-cal__week{ display:grid; grid-template-columns:repeat(7,1fr); text-align:center; font-size:0.72rem; color:var(--guestbook-muted); padding:0.45rem 0.2rem; }
.sched-cal__grid{ display:flex; flex-direction:column; }
.sched-cal__row{ display:grid; grid-template-columns:repeat(7,1fr); }
.sched-cal__row + .sched-cal__row{ border-top:1px solid oklch(0 0 0 / 0.08); }
:root.dark .sched-cal__row + .sched-cal__row{ border-color: oklch(1 0 0 / 0.08); }
.sched-cal__cell{ aspect-ratio:1; padding:0.32rem 0.36rem; text-align:left; border-right:1px solid oklch(0 0 0 / 0.08); background:#fff; display:flex; flex-direction:column; gap:0.2rem; overflow:hidden; cursor:pointer; }
.sched-cal__cell:last-child{ border-right:none; }
:root.dark .sched-cal__cell{ background: transparent; border-color: oklch(1 0 0 / 0.06); }
.sched-cal__cell.is-outside{ color:#9ca3af; background: #fafafa; }
:root.dark .sched-cal__cell.is-outside{ background: oklch(0.14 0 0 / 1); }
.sched-cal__cell.is-today{ background: oklch(0.97 0 0); }
.sched-cal__cell.is-selected{ outline:2px solid #111; outline-offset:-2px; }
:root.dark .sched-cal__cell.is-selected{ outline-color:#fff; }
.sched-cal__day-row{ display:flex; justify-content:space-between; align-items:baseline; font-size:0.72rem; }
.sched-cal__day{ font-size:0.82rem; font-weight:700; }
.sched-cal__lunar{ color:var(--guestbook-muted); font-size:0.62rem; }
.sched-cal__events{ display:flex; flex-direction:column; gap:0.15rem; min-height:1.6rem; }
.sched-cal__event{ font-size:0.62rem; line-height:1.2; padding:0.1rem 0.25rem; border-radius:0.25rem; background: oklch(0.96 0 0); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sched-cal__event.is-holiday{ background: #fef2f2; color:#dc2626; }
.sched-cal__event.is-birthday{ background: #fef9c3; }
:root.dark .sched-cal__event{ background: oklch(0.22 0 0); }
.sched-cal__more{ font-size:0.6rem; color:var(--guestbook-muted); }
@media(max-width:768px){
  .sched-cal__day{ font-size:0.74rem; }
  .sched-cal__lunar{ font-size:0.58rem; }
  .sched-cal__event{ font-size:0.56rem; }
}
.schedules-inner{ display:flex; flex-direction:column; gap:0.8rem; }
.schedules-inner :global(.sched-cal){ width:min(100%, 720px); margin-inline:auto; }
.schedules-below{ display:grid; grid-template-columns:1fr; gap:0.8rem; }
@media(min-width:900px){ .schedules-below{ grid-template-columns:1fr 1fr; } }
.schedules-panel{ background: oklch(1 0 0 / 0.72); backdrop-filter: blur(18px) saturate(1.2); border:1px solid oklch(1 0 0 / 0.45); border-radius:0.75rem; padding:0.8rem; }
:root.dark .schedules-panel{ background: oklch(0.16 0 0 / 0.72); border-color: oklch(1 0 0 / 0.12); }
.schedules-panel__head{ font-size:0.85rem; font-weight:800; margin:0 0 0.6rem; }
.schedules-panel__empty{ color:var(--guestbook-muted); font-size:0.78rem; }
.sched-festival{ display:flex; gap:0.5rem; font-size:0.82rem; padding:0.35rem 0; border-bottom:1px solid var(--guestbook-line); }
.sched-festival__tag{ font-size:0.68rem; padding:0.1rem 0.4rem; border:1px solid var(--guestbook-line); border-radius:9999px; }
.schedules-panel__add{ margin-top:0.6rem; font-size:0.72rem; color:var(--guestbook-muted); }
.schedules-panel__add a{ color:var(--primary); }
.sched-list{ background: oklch(1 0 0 / 0.72); backdrop-filter: blur(22px) saturate(1.4); border:1px solid oklch(1 0 0 / 0.55); border-radius:0.75rem; padding:0.8rem; }
:root.dark .sched-list{ background: oklch(0.16 0 0 / 0.72); border-color: oklch(1 0 0 / 0.12); }
.sched-list__head{ position:sticky; top:0; background: transparent; font-size:0.82rem; font-weight:700; margin:0 0 0.5rem; }
.sched-row{ display:grid; grid-template-columns:0.45rem 1fr auto auto; gap:0.6rem; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--guestbook-line); font-size:0.82rem; }
.sched-row.is-done{ opacity:0.6; text-decoration: line-through; }
.sched-row__dot{ width:0.45rem; height:0.45rem; border-radius:9999px; display:inline-block; }
.sched-row__time{ color:var(--guestbook-muted); font-size:0.72rem; }
.sched-list__empty{ color:var(--guestbook-muted); font-size:0.82rem; }
</style>
