const LUNAR_MONTHS = [
	"正月",
	"二月",
	"三月",
	"四月",
	"五月",
	"六月",
	"七月",
	"八月",
	"九月",
	"十月",
	"十一月",
	"十二月",
];
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
const FESTIVALS: Record<string, string> = {
	"01-01": "元旦",
	"02-14": "情人节",
	"03-08": "妇女节",
	"05-01": "劳动节",
	"06-01": "儿童节",
	"08-07": "七夕",
	"09-10": "教师节",
	"10-01": "国庆节",
	"12-25": "圣诞节",
	"05-04": "青年节",
};

function solarToLunarDay(year: number, month: number, day: number): string {
	// 极简近似：用固定偏移计算农历日（非精确，仅用于展示占位，精确可后续接入 lunar-javascript 轻量库）
	// 这里用一个已知的 2026-02-17 为正月初一 的锚点做偏移
	const anchor = new Date(2026, 1, 17).getTime();
	const cur = new Date(year, month - 1, day).getTime();
	const diff = Math.round((cur - anchor) / 86400000);
	const idx = ((diff % 30) + 30) % 30;
	return LUNAR_DAYS[idx];
}

export function lunarLabel(year: number, month: number, day: number): string {
	const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	if (FESTIVALS[md]) return FESTIVALS[md];
	return solarToLunarDay(year, month, day);
}

export function holidayLabel(month: number, day: number): string | null {
	const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	return FESTIVALS[md] || null;
}
