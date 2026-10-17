import type { DemoCardKey } from "../demoCards";

/**
 * The landing's cards, sorted for the card gallery. Each entry names the view
 * component that draws it and the landing sections it appears in; the card
 * data itself is the landing's own (buildDemoCards), so both stay in step.
 */
export type LandingSpot = "hero" | "ring" | "how" | "chat" | "time" | "trust" | "hands" | "ambience";

export const LANDING_SPOTS: Record<LandingSpot, string> = {
  hero: "首屏展示窗口",
  ring: "场景卡片环",
  how: "一边说，一边看",
  chat: "像聊天一样",
  time: "时间的事",
  trust: "数字有出处",
  hands: "拖到手边",
  ambience: "换一种氛围",
};

export interface CatalogEntry {
  key: DemoCardKey;
  /** What sets this one apart when several share a card type. */
  name: string;
  /** View component, relative to apps/web/src/cards/. */
  view: string;
  spots: LandingSpot[];
}

export interface CatalogGroup { id: string; title: string; note: string; entries: CatalogEntry[] }

export const CATALOG: CatalogGroup[] = [
  { id: "time", title: "时间与日程", note: "倒计时卡按数据分成三种形态：重要日期、纯计时、带事项的提醒。", entries: [
    { key: "countdown", name: "重要日期倒计时", view: "scene/views/CountdownDateView.tsx", spots: ["hero", "ring", "time"] },
    { key: "timer", name: "纯计时器", view: "CountdownCardView.tsx", spots: ["hero", "ring", "time", "ambience"] },
    { key: "reminder", name: "带事项的提醒", view: "CountdownCardView.tsx", spots: ["time"] },
    { key: "week", name: "周计划", view: "scene/views/WeeklyScheduleCardView.tsx", spots: ["ring", "how"] },
    { key: "month", name: "月历", view: "scene/views/MonthCalendarCardView.tsx", spots: ["ring", "time"] },
    { key: "notice", name: "通知", view: "scene/views/NotificationCardView.tsx", spots: ["ring", "time"] },
  ] },
  { id: "tasks", title: "任务与目标", note: "待办和目标卡在落地页的「拖到手边」里以用户页形态出现，可以直接勾选和修改。", entries: [
    { key: "todo", name: "待办清单", view: "TodoCardView.tsx", spots: ["hero", "ring", "how", "hands"] },
    { key: "goal", name: "目标进度环", view: "scene/views/ProgressRingCardView.tsx", spots: ["hero", "ring", "trust", "hands"] },
    { key: "habit", name: "习惯打卡热力图", view: "scene/views/HabitHeatmapCardView.tsx", spots: ["ring"] },
    { key: "roadmap", name: "项目路线图", view: "scene/views/RoadmapCardView.tsx", spots: ["ring"] },
  ] },
  { id: "data", title: "数据与对比", note: "数字只来自用户说的话或数据接口。", entries: [
    { key: "chart", name: "数据图表", view: "ChartCardView.tsx", spots: ["hero", "ring"] },
    { key: "compare", name: "方案对比", view: "scene/views/ComparisonCardView.tsx", spots: ["ring", "chat"] },
    { key: "table", name: "表格", view: "TableCardView.tsx", spots: ["ring"] },
  ] },
  { id: "reading", title: "资料与阅读", note: "", entries: [
    { key: "search", name: "搜索结果", view: "SearchResultCardView.tsx", spots: ["ring"] },
    { key: "link", name: "网页收藏", view: "scene/views/LinkPreviewCardView.tsx", spots: ["ring"] },
    { key: "paper", name: "论文", view: "scene/views/PaperCardView.tsx", spots: ["ring"] },
    { key: "news", name: "新闻摘要", view: "scene/views/NewsCardView.tsx", spots: ["ring"] },
    { key: "book", name: "阅读记录", view: "scene/views/BookCardView.tsx", spots: ["ring"] },
    { key: "quote", name: "金句", view: "scene/views/QuoteCardView.tsx", spots: ["ring"] },
  ] },
  { id: "memories", title: "照片与回忆", note: "示例照片来自 Unsplash，离线时显示占位。", entries: [
    { key: "cover", name: "纪念封面", view: "scene/views/PhotoCoverCardView.tsx", spots: ["ring"] },
    { key: "story", name: "照片故事", view: "scene/views/StoryCarouselCardView.tsx", spots: ["ring"] },
    { key: "gallery", name: "照片墙", view: "scene/views/GalleryCardView.tsx", spots: ["ring"] },
    { key: "timeline", name: "时间线", view: "scene/views/TimelineCardView.tsx", spots: ["ring", "chat"] },
  ] },
  { id: "ambient", title: "环境与动态", note: "", entries: [
    { key: "weather", name: "天气", view: "WeatherCardView.tsx", spots: ["ring", "chat"] },
    { key: "feed", name: "最近动态", view: "scene/views/ActivityFeedCardView.tsx", spots: ["ring"] },
  ] },
];
