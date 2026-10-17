/** Raw text of the files the gallery can show, keyed by repo-root path. */
const raw = import.meta.glob<string>([
  "../../cards/**/*.{ts,tsx,css}",
  "!../../cards/**/__tests__/**",
  "../../index.css",
  "../shared.tsx",
  "../demoCards.ts",
  "../../../../../packages/contracts/src/*.ts",
], { query: "?raw", import: "default", eager: true });

const toRepoPath = (key: string) => key.startsWith("../../../../../") ? key.slice("../../../../../".length)
  : key.startsWith("../../") ? `apps/web/src/${key.slice("../../".length)}`
  : `apps/web/src/landing/${key.slice("../".length)}`;

export const SOURCE_FILES: Record<string, string> = Object.fromEntries(Object.entries(raw).map(([key, text]) => [toRepoPath(key), text]));
