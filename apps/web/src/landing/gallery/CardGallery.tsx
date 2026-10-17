import { useMemo, useState } from "react";
import { SCENE_CARD_KICKERS } from "@/cards/scene/sceneMeta";
import type { CardRecord } from "@/contracts";
import { buildDemoCards } from "../demoCards";
import { CardFrame, useDemoCardState, Wordmark } from "../shared";
import { CATALOG, LANDING_SPOTS } from "./catalog";

const CARD_MAX_W = 420;
const CARD_MAX_H = 440;

/**
 * Every card the landing shows, grouped, each with the sentence that makes it,
 * its card type, view component, size and where it appears on the landing.
 * Display mode is what the Display draws; user-page mode can be edited here,
 * in memory only, through the same schema gate as the landing demos.
 */
export function CardGallery() {
  const demo = useMemo(() => buildDemoCards(), []);
  const [mode, setMode] = useState<"display" | "control">("display");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const { cards, actions } = useDemoCardState(Object.values(demo).map(item => item.card));
  const total = CATALOG.reduce((sum, group) => sum + group.entries.length, 0);
  const types = new Set(CATALOG.flatMap(group => group.entries.map(entry => demo[entry.key].card.type))).size;

  return <div className={`lp lp-gallery${theme === "dark" ? " dark" : ""}`} data-theme={theme}>
    <header className="lp-gallery-head">
      <div>
        <Wordmark />
        <h1>落地页卡片组件</h1>
        <p>{total} 张示例卡，{types} 种卡片类型，全部由产品自己的卡片组件渲染。每张卡下面是生成它的那句话。</p>
      </div>
      <div className="lp-gallery-controls">
        <div role="radiogroup" aria-label="呈现位置">
          <button type="button" role="radio" aria-checked={mode === "display"} onClick={() => setMode("display")}>展示页</button>
          <button type="button" role="radio" aria-checked={mode === "control"} onClick={() => setMode("control")}>用户页（可编辑）</button>
        </div>
        <div role="radiogroup" aria-label="明暗">
          <button type="button" role="radio" aria-checked={theme === "light"} onClick={() => setTheme("light")}>浅色</button>
          <button type="button" role="radio" aria-checked={theme === "dark"} onClick={() => setTheme("dark")}>深色</button>
        </div>
      </div>
      <nav className="lp-gallery-nav" aria-label="分组">
        {CATALOG.map(group => <a key={group.id} href={`#${group.id}`}>{group.title}<span>{group.entries.length}</span></a>)}
      </nav>
    </header>

    {CATALOG.map(group => <section key={group.id} id={group.id} className="lp-gallery-group">
      <h2>{group.title}</h2>
      {group.note && <p className="lp-gallery-note">{group.note}</p>}
      <div className="lp-gallery-grid">
        {group.entries.map(entry => {
          const card = cards[demo[entry.key].card.id] as CardRecord;
          const kicker = SCENE_CARD_KICKERS[card.type];
          const Icon = kicker.icon;
          const scale = Math.min(1, CARD_MAX_W / card.layout.width, CARD_MAX_H / card.layout.height);
          return <article key={entry.key} className="lp-gallery-item" data-card-key={entry.key}>
            <div className="lp-gallery-stage">
              <CardFrame card={card} mode={mode} actions={actions} theme={theme} scale={scale} />
            </div>
            <div className="lp-gallery-meta">
              <h3><Icon size={14} aria-hidden />{entry.name}<span className="lp-gallery-kicker">{kicker.label}</span></h3>
              <p className="lp-gallery-prompt">“{demo[entry.key].prompt}”</p>
              <dl>
                <dt>类型</dt><dd><code>{card.type}</code></dd>
                <dt>组件</dt><dd><code>cards/{entry.view}</code></dd>
                <dt>尺寸</dt><dd>{card.layout.width} × {card.layout.height}</dd>
                <dt>出现在</dt><dd className="lp-gallery-spots">{entry.spots.map(spot => <span key={spot}>{LANDING_SPOTS[spot]}</span>)}</dd>
              </dl>
            </div>
          </article>;
        })}
      </div>
    </section>)}

    <footer className="lp-gallery-foot">示例数据见 <code>apps/web/src/landing/demoCards.ts</code>，分组见 <code>src/landing/gallery/catalog.ts</code>。这里的修改只在本页内存里，不保存、不联网。</footer>
  </div>;
}
