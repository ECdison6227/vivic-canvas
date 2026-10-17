import { useMemo, useRef, useState } from "react";
import { CardRecordSchema, SCENE_BY_ID, SCENES, type CardRecord, type SceneId } from "@/contracts";
import { VivicCard } from "@/cards/VivicCard";
import { fixedContentHeight } from "@/cards/sizing";
import { CardActionsContext, CardModeContext, type CardActions } from "@/cards/scene/cardContext";
import { buildEdgeFixtures, buildSceneFixtures } from "@/cards/scene/fixtures";
import { storePhotos } from "@/cards/scene/photos";
import { SubcardThemeContext } from "@/cards/SubcardEditorContext";
import "@/cards/scene/sceneCards.css";
import "@/control/userCardLayer.css";

/** One test utterance per scene — type it into the real Control input to exercise the AI path. */
const SAMPLE_INPUT: Record<SceneId, string> = {
  countdown: "距离我的生日还有 25 天，帮我做个倒计时",
  academic_paper: "帮我整理一下这篇论文：Attention Is All You Need，作者 Ashish Vaswani……",
  photo_gallery: "把这几张一起拍的照片做成照片墙：https://… https://…",
  weekly_schedule: "帮我规划下周安排：周一上午9点开会，周三下午3点去健身房",
  todo_list: "今天有什么要完成：交周报、取快递、给妈妈打电话",
  project_roadmap: "未来三个月怎么推进这个 App 项目：第一个月调研……",
  data_visualization: "这周每天的步数：周一 8000，周二 6500……帮我看看趋势",
  news_summary: "帮我摘要这条新闻：本市地铁 5 号线南延段将于……",
  historical_timeline: "整理我们认识以来的重要事情：2019年9月在图书馆认识……",
  quote_note: "记一句今天读到的话：“好的设计，是让人感觉不到设计。”",
  photo_story: "用这三张照片讲讲我们的旅行故事：第一天出发 https://…",
  activity_feed: "最近产生了什么活动？",
  goal_progress: "今年读书目标 50 本，已经读了 18 本，看看完成多少了",
  habit_tracking: "我每天跑步打卡，10月15日、10月16日和今天都跑了",
  book_record: "记录一下我在读《思考，快与慢》，读到第 86 页，一共 240 页",
  monthly_calendar: "这个月的安排：10月20日体检，10月25日交房租",
  option_comparison: "帮我比较三套租房方案：A 月租 5200 通勤 15 分钟……",
  web_bookmark: "收藏这个网站 https://github.com/xyflow/xyflow",
  photo_memory: "把这张照片做成纪念卡：2025年12月31日在外滩看跨年烟火 https://…",
  single_notification: "通知：快递已经到驿站了，取件码 8-2-3017",
};

type Theme = "light" | "dark";
type Width = "desktop" | "mobile";

/**
 * Dev-only Card Playground (/playground): every scene card with SAMPLE data,
 * side by side in Display and user-page (control) mode, light/dark and mobile
 * width. Edits stay in this page's memory — it never opens the canvas DB or
 * the sync channel, so the user's real canvas is untouched. It complements,
 * not replaces, the real chat → AI → card path.
 */
export function CardPlayground() {
  const [cards, setCards] = useState<Record<string, CardRecord>>(() => {
    const scenes = buildSceneFixtures();
    return Object.fromEntries([...Object.values(scenes), ...buildEdgeFixtures().map(item => item.card)].map(card => [card.id, card]));
  });
  const scenes = useMemo(() => buildSceneFixtures(), []);
  const edges = useMemo(() => buildEdgeFixtures(), []);
  const [selected, setSelected] = useState<SceneId | "all" | "edge">("all");
  const [theme, setTheme] = useState<Theme>("light");
  const [width, setWidth] = useState<Width>("desktop");
  const [log, setLog] = useState<string[]>([]);

  const latest = useRef(cards);
  latest.current = cards;
  const actions = useMemo<CardActions>(() => ({
    editable: true,
    // Same rule as the owner's card.update: shallow merge, then the full card schema.
    update: (cardId, patch) => {
      const current = latest.current[cardId];
      if (!current) return false;
      const parsed = CardRecordSchema.safeParse({ ...current,
        displayProps: { ...current.displayProps, ...patch.displayProps },
        sourceData: { ...current.sourceData, ...patch.sourceData },
        metadata: { ...current.metadata, updatedAt: new Date().toISOString() } });
      setLog(entries => [`${new Date().toLocaleTimeString()} ${cardId} ${parsed.success ? "已更新" : "被校验拒绝"}`, ...entries].slice(0, 8));
      if (!parsed.success) return false;
      latest.current = { ...latest.current, [cardId]: parsed.data };
      setCards(latest.current);
      return true;
    },
    remove: cardId => { setLog(entries => [`删除 ${cardId}（演练，不会真的删除）`, ...entries].slice(0, 8)); return true; },
    addPhotos: async files => (await storePhotos(files, 36)).images,
  }), []);

  const shown: Array<{ label: string; card: CardRecord }> = selected === "all"
    ? SCENES.map(scene => ({ label: `${scene.id} → ${scene.cardType}`, card: cards[scenes[scene.id].id]! }))
    : selected === "edge" ? edges.map(item => ({ label: item.label, card: cards[item.card.id]! }))
    : [{ label: `${selected} → ${SCENE_BY_ID[selected].cardType}`, card: cards[scenes[selected].id]! }];

  return <div className={`min-h-screen ${theme === "dark" ? "dark bg-neutral-950 text-neutral-100" : "bg-neutral-100 text-neutral-900"}`} data-card-playground>
    <div className="mx-auto flex max-w-[1500px] gap-6 p-5">
      <aside className="sticky top-5 hidden h-[calc(100vh-40px)] w-64 shrink-0 overflow-auto md:block">
        <h1 className="text-base font-semibold">Card Playground</h1>
        <p className="mt-1 text-xs opacity-70">示例数据，仅在本页内存中；不连接真实画布。</p>
        <nav className="mt-4 grid gap-1 text-sm">
          <button type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10" aria-pressed={selected === "all"} onClick={() => setSelected("all")}>全部 20 张</button>
          <button type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10" aria-pressed={selected === "edge"} onClick={() => setSelected("edge")}>边界样例（长文本 / 空数据 / 坏图片）</button>
          {SCENES.map(scene => <button key={scene.id} type="button" className="rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
            aria-pressed={selected === scene.id} data-playground-scene={scene.id} onClick={() => setSelected(scene.id)}>
            <span className="block font-medium">{scene.label}</span>
            <span className="block text-[11px] opacity-60">{scene.id} → {scene.cardType}</span>
          </button>)}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select className="rounded-md border border-current/20 bg-transparent px-2 py-1 md:hidden" value={selected} onChange={event => setSelected(event.target.value as SceneId)} aria-label="选择场景">
            <option value="all">全部 20 张</option><option value="edge">边界样例</option>
            {SCENES.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}
          </select>
          {(["light", "dark"] as const).map(value => <button key={value} type="button" className="rounded-md border border-current/20 px-3 py-1" aria-pressed={theme === value}
            onClick={() => setTheme(value)}>{value === "light" ? "浅色" : "深色"}</button>)}
          {(["desktop", "mobile"] as const).map(value => <button key={value} type="button" className="rounded-md border border-current/20 px-3 py-1" aria-pressed={width === value}
            onClick={() => setWidth(value)}>{value === "desktop" ? "桌面" : "手机 375"}</button>)}
          <span className="text-xs opacity-60">左：副屏（Display）· 右：用户页（Control，可交互）</span>
        </div>
        {log.length > 0 && <ol className="mt-2 text-xs opacity-70" data-playground-log>{log.map((entry, i) => <li key={i}>{entry}</li>)}</ol>}
        <div className="mt-4 grid gap-8">
          {shown.map(({ label, card }) => <section key={card.id} className="grid gap-2" data-playground-card={card.type}>
            <h2 className="text-xs font-semibold tracking-wide opacity-70">{label}{selected !== "all" && selected !== "edge" && <span className="ml-2 font-normal">示例输入：{SAMPLE_INPUT[selected]}</span>}</h2>
            <div className="flex flex-wrap items-start gap-6">
              <SubcardThemeContext.Provider value={theme}>
                <div className="rounded-2xl p-6" style={{ background: theme === "dark" ? "radial-gradient(circle at 30% 20%, #3a3a46, #121216)" : "radial-gradient(circle at 30% 20%, #f4f4f6, #d9d9de)" }}
                  data-playground-surface="display">
                  <CardModeContext.Provider value="display">
                    <div className="vivic-card" style={{ width: card.layout.width }}>
                      <VivicCard record={card} height={fixedContentHeight(card)} />
                    </div>
                  </CardModeContext.Provider>
                </div>
              </SubcardThemeContext.Provider>
              <div style={{ width: width === "mobile" ? 375 : Math.max(340, card.layout.width + 40) }} data-playground-surface="control">
                <CardModeContext.Provider value="control">
                  <CardActionsContext.Provider value={actions}>
                    <article className="vivic-user-card"><VivicCard record={card} /></article>
                  </CardActionsContext.Provider>
                </CardModeContext.Provider>
              </div>
            </div>
            {selected !== "all" && selected !== "edge" && <details className="text-xs">
              <summary className="cursor-pointer opacity-70">卡片 JSON（经 CardRecordSchema 校验）</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-black/5 p-3 dark:bg-white/10">{JSON.stringify(card, null, 2)}</pre>
            </details>}
          </section>)}
        </div>
      </main>
    </div>
  </div>;
}
