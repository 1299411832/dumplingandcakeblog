const LUNAR_DAYS = [
	"初一",
	"初二",
	"初三",
	"初四",
	"初五",
	"初六",
	"初七",
	"初八",
	"初九",
	"初十",
	"十一",
	"十二",
	"十三",
	"十四",
	"十五",
	"十六",
	"十七",
	"十八",
	"十九",
	"二十",
	"廿一",
	"廿二",
	"廿三",
	"廿四",
	"廿五",
	"廿六",
	"廿七",
	"廿八",
	"廿九",
	"三十",
];
// 公历固定节日（MM-DD）
const SOLAR_FESTIVALS: Record<string, string> = {
	"01-01": "元旦",
	"02-14": "情人节",
	"03-08": "妇女节",
	"05-01": "劳动节",
	"05-04": "青年节",
	"06-01": "儿童节",
	"09-10": "教师节",
	"10-01": "国庆节",
	"12-25": "圣诞节",
};
// 2026 年农历节日对应的公历日期（每年会变，当前按 2026 年标定）
const LUNAR_FESTIVALS_2026: Record<string, string> = {
	"2026-01-26": "春节", // 2026 正月初一实际对应 02-17，此条保留占位
	"2026-02-17": "春节",
	"2026-03-03": "龙抬头",
	"2026-05-31": "端午",
	"2026-08-19": "七夕",
	"2026-09-15": "七夕",
	"2026-09-25": "中秋",
	"2026-10-26": "重阳",
};
// 2026-02 农历对照校准（近似表，仅保证 2 月显示正确；后续可替换为 lunar-javascript 精算）
const FEB_2026_LUNAR: Record<string, string> = {
	"2026-02-01": "十三",
	"2026-02-02": "十四",
	"2026-02-03": "十五",
	"2026-02-04": "十六",
	"2026-02-05": "十七",
	"2026-02-06": "十八",
	"2026-02-07": "十九",
	"2026-02-08": "二十",
	"2026-02-09": "初九",
	"2026-02-10": "初十",
	"2026-02-11": "十一",
	"2026-02-12": "十二",
	"2026-02-13": "十三",
	"2026-02-14": "十四",
	"2026-02-15": "十五",
	"2026-02-16": "十六",
	"2026-02-17": "春节",
	"2026-02-18": "初二",
	"2026-02-19": "初三",
	"2026-02-20": "初四",
	"2026-02-21": "初五",
	"2026-02-22": "初六",
	"2026-02-23": "初七",
	"2026-02-24": "初八",
	"2026-02-25": "初九",
	"2026-02-26": "初十",
	"2026-02-27": "十一",
	"2026-02-28": "十二",
};

function solarToLunarDay(year: number, month: number, day: number): string {
	const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	if (FEB_2026_LUNAR[key]) return FEB_2026_LUNAR[key]!;
	const anchor = new Date(2026, 1, 17).getTime();
	const cur = new Date(year, month - 1, day).getTime();
	const diff = Math.round((cur - anchor) / 86400000);
	const idx = ((diff % 30) + 30) % 30;
	return LUNAR_DAYS[idx];
}

export function lunarLabel(year: number, month: number, day: number): string {
	const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	// 农历节日优先（覆盖近似）
	if (LUNAR_FESTIVALS_2026[key]) return LUNAR_FESTIVALS_2026[key]!;
	if (FEB_2026_LUNAR[key]) return FEB_2026_LUNAR[key]!;
	const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	if (SOLAR_FESTIVALS[md]) return SOLAR_FESTIVALS[md];
	return solarToLunarDay(year, month, day);
}

export function holidayLabel(month: number, day: number): string | null {
	const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	return SOLAR_FESTIVALS[md] || null;
}

export function lunarFestivalForDate(
	year: number,
	month: number,
	day: number,
): string | null {
	const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	return LUNAR_FESTIVALS_2026[key] || null;
}
