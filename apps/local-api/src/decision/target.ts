import type { IntentRouteId } from "@vivic/contracts";
import type { CanvasContext } from "../schemas.js";
import { cardLabel, cardTitle, selectedCards, type IntentRouter } from "./router.js";

export type TargetResult = { targetId: string } | { ambiguous: Array<{ id: string; label: string }> } | { missing: true };
const targeted = new Set<IntentRouteId>(["focus", "highlight", "edit", "arrange", "delete"]);
const types: Array<[RegExp, RegExp]> = [[/待办|任务清单/, /TodoCard/], [/便签|便笺|笔记/, /NoteCard/],
  [/倒计时|计时器|提醒/, /CountdownCard/], [/天气/, /WeatherCard/], [/新闻|回答/, /NewsCard/],
  [/表格/, /TableCard/], [/图表/, /ChartCard/]];
export async function resolveTarget(text: string, context: CanvasContext, route: IntentRouteId,
  router?: Pick<IntentRouter, "chooseTarget">, signal?: AbortSignal): Promise<TargetResult | undefined> {
  if (!targeted.has(route)) return undefined;
  const cards = selectedCards(context);
  const labels = (values: typeof cards) => values.map(card => ({ id: card.id, label: cardTitle(card).slice(0, 120) }));
  if (!cards.length) return { missing: true };
  const names = cards.filter(card => [cardTitle(card), ...(card.aliases ?? [])]
    .some(name => name.length >= 2 && text.toLocaleLowerCase().includes(name.toLocaleLowerCase())));
  if (names.length === 1) return { targetId: names[0]!.id };
  if (/这张|它|刚才那张/.test(text)) {
    const focus = context.focusHistory.at(-1);
    if (focus && cards.some(card => card.id === focus)) return { targetId: focus };
  }
  const type = types.find(([pattern]) => pattern.test(text))?.[1];
  const pool = type ? cards.filter(card => type.test(card.type)) : cards;
  if (!pool.length) return { missing: true };
  const spatial = /左边|左侧|最左/.test(text) ? { axis: "x" as const, sign: 1 }
    : /右边|右侧|最右/.test(text) ? { axis: "x" as const, sign: -1 }
      : /上面|上方|最上/.test(text) ? { axis: "y" as const, sign: 1 }
        : /下面|下方|最下/.test(text) ? { axis: "y" as const, sign: -1 } : null;
  if (spatial) {
    const sorted = [...pool].sort((a, b) => spatial.sign * (a.layout[spatial.axis] - b.layout[spatial.axis]));
    if (sorted.length === 1 || sorted[0]!.layout[spatial.axis] !== sorted[1]!.layout[spatial.axis]) return { targetId: sorted[0]!.id };
    return { ambiguous: labels(sorted.filter(card => card.layout[spatial.axis] === sorted[0]!.layout[spatial.axis])) };
  }
  if (type && pool.length === 1) return { targetId: pool[0]!.id };
  if (cards.some(card => ["ambiguous", "missing"].includes(card.id))) return { ambiguous: labels(pool) };
  const criteria = Object.fromEntries(pool.map(card => [card.id, cardLabel(card)]));
  Object.assign(criteria, { ambiguous: "用户指的卡片不唯一，需要追问", missing: "画布上没有用户说的卡片" });
  const result = await router?.chooseTarget(text, context, criteria, signal);
  if (result?.choice === "missing" && result.probability >= .8) return { missing: true };
  if (result?.choice && result.probability >= .8 && pool.some(card => card.id === result.choice)) return { targetId: result.choice };
  return { ambiguous: labels(names.length ? names : pool) };
}
