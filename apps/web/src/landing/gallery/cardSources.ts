import type { DemoCardKey } from "../demoCards";

/**
 * Which source files make each landing card, for the card gallery and for
 * scripts/export-card-sources.mjs. Paths are relative to the repo root. A part
 * is a whole file unless it picks a slice: zod schemas (plus the local helpers
 * they use), CSS rules whose selector names a class, or one demo card entry.
 * Plain data and pure functions only, so Node can load this file directly.
 */
export type SourcePick = { schemas: string[] } | { css: string[] } | { demo: string };

export interface SourcePart { path: string; label: string; pick?: SourcePick }

export interface SharedSourceGroup { title: string; note: string; paths: string[] }

const CARDS = "apps/web/src/cards/";
const CONTRACTS = "packages/contracts/src/";

const view = (file: string, label = "视图组件"): SourcePart => ({ path: CARDS + file, label });
const style = (file: string): SourcePart => ({ path: CARDS + file, label: "样式" });
const schema = (file: string, name: string): SourcePart => ({ path: CONTRACTS + file, label: "数据结构", pick: { schemas: [name] } });
const globalCss = (...classes: string[]): SourcePart => ({ path: "apps/web/src/index.css", label: "样式（index.css 节选）", pick: { css: classes } });
const demo = (key: DemoCardKey): SourcePart => ({ path: "apps/web/src/landing/demoCards.ts", label: "落地页示例数据", pick: { demo: key } });

/** A scene card: its view, its own stylesheet when it has one, and its schema. */
const scene = (key: DemoCardKey, type: string, ownCss = true, extra: SourcePart[] = []): SourcePart[] => [
  view(`scene/views/${type}View.tsx`),
  ...(ownCss ? [style(`scene/views/${type}View.css`)] : []),
  ...extra,
  schema("sceneCards.ts", `${type}Schema`),
  demo(key),
];

export const CARD_SOURCES: Record<DemoCardKey, SourcePart[]> = {
  countdown: [view("scene/views/CountdownDateView.tsx"), schema("cardRecord.ts", "CountdownCardSchema"), demo("countdown")],
  timer: [view("CountdownCardView.tsx"), globalCss("vivic-countdown"), schema("cardRecord.ts", "CountdownCardSchema"), demo("timer")],
  reminder: [view("ReminderListView.tsx"), view("TargetBadge.tsx", "编号角标"), globalCss("vivic-reminder-list", "vivic-reminder-row", "vivic-reminder-time", "vivic-target-badge"),
    schema("cardRecord.ts", "CountdownCardSchema"), demo("reminder")],
  week: scene("week", "WeeklyScheduleCard"),
  month: scene("month", "MonthCalendarCard"),
  notice: scene("notice", "NotificationCard"),
  todo: [view("TodoCardView.tsx"), schema("cardRecord.ts", "TodoCardSchema"), demo("todo")],
  goal: scene("goal", "ProgressRingCard", false),
  habit: scene("habit", "HabitHeatmapCard"),
  roadmap: scene("roadmap", "RoadmapCard"),
  chart: [view("ChartCardView.tsx"), view("StyledDataTable.tsx", "数据表格（与表格卡共用）"), schema("cardRecord.ts", "ChartCardSchema"), demo("chart")],
  compare: scene("compare", "ComparisonCard"),
  table: [view("TableCardView.tsx"), view("StyledDataTable.tsx", "数据表格（与图表卡共用）"), schema("cardRecord.ts", "TableCardSchema"), demo("table")],
  search: [view("SearchResultCardView.tsx"), globalCss("vivic-search"), schema("cardRecord.ts", "SearchResultCardSchema"), demo("search")],
  link: scene("link", "LinkPreviewCard"),
  paper: scene("paper", "PaperCard"),
  news: scene("news", "NewsCard"),
  book: scene("book", "BookCard"),
  quote: scene("quote", "QuoteCard"),
  cover: scene("cover", "PhotoCoverCard"),
  story: scene("story", "StoryCarouselCard"),
  gallery: scene("gallery", "GalleryCard", true, [view("scene/Lightbox.tsx", "大图查看")]),
  timeline: scene("timeline", "TimelineCard"),
  weather: [view("WeatherCardView.tsx"), schema("cardRecord.ts", "WeatherCardSchema"), demo("weather")],
  feed: scene("feed", "ActivityFeedCard"),
};

/** Files every card (or a family of cards) goes through. */
export const SHARED_SOURCES: SharedSourceGroup[] = [
  { title: "渲染入口", note: "CardRecord → 按 type 选视图 → 出错只影响这一张卡。", paths: [
    `${CARDS}VivicCard.tsx`, `${CARDS}registry.tsx`, `${CARDS}scene/CardErrorBoundary.tsx`, `${CARDS}scene/types.ts`, `${CARDS}sizing.ts`, `${CARDS}metrics.ts`,
  ] },
  { title: "场景卡外壳", note: "场景卡共用的标题栏、角标、徽章、展示页 / 用户页模式和编辑接口；待办和图表卡也用这里的样式。", paths: [
    `${CARDS}scene/SceneCardShell.tsx`, `${CARDS}scene/sceneCards.css`, `${CARDS}scene/sceneMeta.ts`, `${CARDS}scene/cardContext.ts`, `${CARDS}SubcardEditorContext.ts`,
  ] },
  { title: "公共小部件与工具", note: "详情弹层、图片、日期计算、子卡片锚点，以及经典卡使用的 assistant-ui 渲染库。", paths: [
    `${CARDS}scene/DetailPopover.tsx`, `${CARDS}scene/MediaImage.tsx`, `${CARDS}scene/media.ts`, `${CARDS}scene/photos.ts`, `${CARDS}scene/dates.ts`,
    `${CARDS}SubcardAnchor.tsx`, `${CARDS}vivicGUILibrary.tsx`, `${CARDS}dataCardTypes.ts`,
  ] },
  { title: "数据契约", note: "所有卡片共有的字段（id、layout、metadata、sources…）和场景表、场景卡尺寸。", paths: [
    `${CONTRACTS}cardCommon.ts`, `${CONTRACTS}scenes.ts`,
  ] },
  { title: "落地页外框", note: "落地页怎么摆出这些卡：CardFrame 缩放与模式、内存里的编辑、全部示例数据。", paths: [
    "apps/web/src/landing/shared.tsx", "apps/web/src/landing/demoCards.ts",
  ] },
];

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** The part's text: the whole file, or the slice it picks. */
export function sliceSource(text: string, pick?: SourcePick): string {
  const source = text.replace(/\r\n/g, "\n");
  if (!pick) return source;
  if ("schemas" in pick) return pickDeclarations(source, pick.schemas);
  if ("css" in pick) return pickCssRules(source, pick.css);
  return pickDemo(source, pick.demo);
}

/** Top-level `const` declarations by name, with the local ones they use, in file order. */
function pickDeclarations(source: string, names: string[]): string {
  const lines = source.split("\n");
  const blocks = new Map<string, { start: number; text: string }>();
  for (let i = 0; i < lines.length; i++) {
    const match = /^(?:export )?const (\w+)\b/.exec(lines[i]!);
    if (!match) continue;
    let start = i;
    while (start > 0 && /^\s*(?:\/\*\*|\*|\/\/)/.test(lines[start - 1]!)) start--;
    let end = i + 1;
    while (end < lines.length && (lines[end] === "" ? false : /^[\s})\]]/.test(lines[end]!))) end++;
    blocks.set(match[1]!, { start, text: lines.slice(start, end).join("\n") });
  }
  const picked = new Set<string>();
  const visit = (name: string) => {
    const block = blocks.get(name);
    if (!block || picked.has(name)) return;
    picked.add(name);
    for (const [, used] of block.text.matchAll(/\b(\w+)\b/g)) if (used !== name && blocks.has(used!)) visit(used!);
  };
  names.forEach(visit);
  return [...picked].map(name => blocks.get(name)!).sort((a, b) => a.start - b.start).map(block => block.text).join("\n\n") + "\n";
}

/** Rules (and at-rules) whose prelude names one of the classes, keeping @media wrappers. */
function pickCssRules(source: string, classes: string[]): string {
  const wanted = (prelude: string) => classes.some(name => prelude.includes(name));
  const walk = (css: string): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < css.length) {
      const open = css.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let close = open + 1;
      while (close < css.length && depth > 0) {
        if (css[close] === "{") depth++;
        else if (css[close] === "}") depth--;
        close++;
      }
      const prelude = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const body = css.slice(open + 1, close - 1);
      if (/^@(media|supports|container|layer)\b/.test(prelude)) {
        const inner = walk(body);
        if (inner.length) out.push(`${prelude} {\n${inner.map(rule => rule.replace(/^/gm, "  ")).join("\n")}\n}`);
      } else if (wanted(prelude)) {
        out.push(`${prelude} {${body}}`);
      }
      i = close;
    }
    return out;
  };
  return walk(source).join("\n") + "\n";
}

/** One `key: { … },` entry of buildDemoCards. */
function pickDemo(source: string, key: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex(line => line === `    ${key}: {`);
  if (start < 0) return "";
  const end = lines.findIndex((line, i) => i > start && /^ {4}\},?$/.test(line));
  return lines.slice(start, end + 1).map(line => line.slice(4)).join("\n") + "\n";
}
