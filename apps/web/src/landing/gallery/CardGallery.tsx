import { useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { SCENE_CARD_KICKERS } from "@/cards/scene/sceneMeta";
import type { CardRecord } from "@/contracts";
import { buildDemoCards } from "../demoCards";
import { CardFrame, useDemoCardState, Wordmark } from "../shared";
import { CATALOG, LANDING_SPOTS } from "./catalog";
import { CARD_SOURCES, SHARED_SOURCES } from "./cardSources";
import { CardSources, SourceBlock, sharedSourceText } from "./SourceView";

const CARD_MAX_W = 420;
const CARD_MAX_H = 440;

/**
 * Every card the landing shows, grouped, each with the sentence that makes it,
 * its card type, view component, size, where it appears on the landing and,
 * on demand, the source that draws it (view, styles, schema, demo data).
 * Display mode is what the Display draws; user-page mode can be edited here,
 * in memory only, through the same schema gate as the landing demos.
 */
export function CardGallery() {
  const demo = useMemo(() => buildDemoCards(), []);
  const [mode, setMode] = useState<"display" | "control">("display");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [openSources, setOpenSources] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSource = (key: string) => setOpenSources(open => { const next = new Set(open); if (next.has(key)) next.delete(key); else next.add(key); return next; });
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
        <a href="#shared">公共依赖<span>{SHARED_SOURCES.reduce((sum, group) => sum + group.paths.length, 0)}</span></a>
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
              <button type="button" className="lp-source-toggle" aria-expanded={openSources.has(entry.key)} onClick={() => toggleSource(entry.key)}>
                <Code2 size={14} aria-hidden />{openSources.has(entry.key) ? "收起源码" : `源码 · ${CARD_SOURCES[entry.key].length} 部分`}
              </button>
            </div>
            {openSources.has(entry.key) && <CardSources parts={CARD_SOURCES[entry.key]} />}
          </article>;
        })}
      </div>
    </section>)}

    <section id="shared" className="lp-gallery-group">
      <h2>公共依赖</h2>
      <p className="lp-gallery-note">上面每张卡都要经过这些文件；点开查看完整源码。</p>
      {SHARED_SOURCES.map(group => <div key={group.title} className="lp-shared-group">
        <h3>{group.title}</h3>
        <p className="lp-gallery-note">{group.note}</p>
        {group.paths.map(path => <details key={path} className="lp-shared-file">
          <summary><code>{path}</code></summary>
          <SourceBlock path={path} text={sharedSourceText(path)} excerpt={false} />
        </details>)}
      </div>)}
    </section>

    <footer className="lp-gallery-foot">示例数据见 <code>apps/web/src/landing/demoCards.ts</code>，分组见 <code>src/landing/gallery/catalog.ts</code>。这里的修改只在本页内存里，不保存、不联网。</footer>
  </div>;
}
