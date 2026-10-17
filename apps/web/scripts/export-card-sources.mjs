// Copies the source of every landing card into one folder, one directory per
// card (view, styles, schema slice, demo data) plus the shared files they all
// go through. Usage: node scripts/export-card-sources.mjs [output dir]
// (default dist-card-sources/). Reads the same manifest as the card gallery.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const web = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(web, "../..");
const load = file => import(pathToFileURL(path.join(web, "src/landing/gallery", file)).href);
const { CATALOG, LANDING_SPOTS } = await load("catalog.ts");
const { CARD_SOURCES, SHARED_SOURCES, sliceSource, fileName } = await load("cardSources.ts");
const output = path.resolve(process.argv[2] ?? path.join(web, "dist-card-sources"));

const read = file => fs.readFileSync(path.join(repo, file), "utf8");
const pad = n => String(n).padStart(2, "0");
const lines = text => text.replace(/\n$/, "").split("\n").length;
const comment = (file, text) => file.endsWith(".css") ? `/* ${text} */\n` : `// ${text}\n`;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

/** File name inside a card folder for one source part. */
const partFile = part => !part.pick ? fileName(part.path)
  : "schemas" in part.pick ? "schema.ts"
  : "css" in part.pick ? "styles.excerpt.css"
  : "demo.ts";

fs.rmSync(output, { recursive: true, force: true });
const index = ["# 落地页卡片源码", "", "按卡片整理的源码副本，原文件在仓库里的位置写在每个文件第一行和各目录的 README。节选文件只含这张卡用到的部分。", ""];

index.push("## 公共依赖", "");
SHARED_SOURCES.forEach((group, g) => {
  const dir = path.posix.join("00-公共依赖", `${pad(g + 1)}-${group.title}`);
  index.push(`### ${group.title}`, "", group.note, "");
  for (const file of group.paths) {
    write(path.join(output, dir, fileName(file)), read(file).replace(/\r\n/g, "\n"));
    index.push(`- [${fileName(file)}](${encodeURI(`${dir}/${fileName(file)}`)}) ← \`${file}\``);
  }
  index.push("");
});

CATALOG.forEach((group, g) => {
  index.push(`## ${group.title}`, "");
  if (group.note) index.push(group.note, "");
  index.push("| 卡片 | 目录 | 文件 |", "|---|---|---|");
  group.entries.forEach((entry, c) => {
    const dir = path.posix.join(`${pad(g + 1)}-${group.title}`, `${pad(c + 1)}-${entry.name}`);
    const parts = CARD_SOURCES[entry.key];
    const readme = [`# ${entry.name}`, "", `落地页位置：${entry.spots.map(spot => LANDING_SPOTS[spot]).join("、")}`, "",
      "| 文件 | 内容 | 原位置 |", "|---|---|---|"];
    for (const part of parts) {
      const name = partFile(part);
      const text = sliceSource(read(part.path), part.pick);
      const origin = part.pick ? `节选自 ${part.path}` : part.path;
      write(path.join(output, dir, name), comment(name, origin) + text);
      readme.push(`| [${name}](${encodeURI(name)}) | ${part.label}（${lines(text)} 行） | \`${part.path}\`${part.pick ? " 节选" : ""} |`);
    }
    readme.push("", "公共依赖（渲染入口、场景卡外壳、日期与图片工具、数据契约）见 `../../00-公共依赖/`。", "");
    write(path.join(output, dir, "README.md"), readme.join("\n"));
    index.push(`| ${entry.name} | [${pad(c + 1)}-${entry.name}](${encodeURI(dir)}/README.md) | ${parts.map(partFile).join("、")} |`);
  });
  index.push("");
});

write(path.join(output, "README.md"), index.join("\n"));
const count = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`${path.relative(process.cwd(), output) || "."}  ${count(output)} files`);
