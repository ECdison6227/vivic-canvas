import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { fileName, sliceSource, type SourcePart } from "./cardSources";
import { SOURCE_FILES } from "./sourceFiles";

const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;

/** One file (or slice), with its repo path and a copy button. */
export function SourceBlock({ path, text, excerpt }: { path: string; text: string; excerpt: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  };
  return <div className="lp-source-block">
    <div className="lp-source-path">
      <code>{path}</code>{excerpt && <span>节选</span>}<small>{lineCount(text)} 行</small>
      <button type="button" onClick={copy} aria-label="复制源码">{copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}</button>
    </div>
    <pre><code>{text}</code></pre>
  </div>;
}

/** Tabs over a card's source parts. */
export function CardSources({ parts }: { parts: SourcePart[] }) {
  const [active, setActive] = useState(0);
  const part = parts[active]!;
  const text = sliceSource(SOURCE_FILES[part.path] ?? `// 找不到 ${part.path}\n`, part.pick);
  return <div className="lp-source">
    <div className="lp-source-tabs" role="tablist">
      {parts.map((item, i) => <button key={`${item.path}-${i}`} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
        {item.label}<span>{item.pick && "demo" in item.pick ? "demoCards.ts" : fileName(item.path)}</span>
      </button>)}
    </div>
    <SourceBlock path={part.path} text={text} excerpt={Boolean(part.pick)} />
  </div>;
}

export function sharedSourceText(path: string) {
  return sliceSource(SOURCE_FILES[path] ?? `// 找不到 ${path}\n`);
}
