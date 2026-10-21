import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePackageFiles, readPackageZip } from "./index";

try {
  const target = process.argv[2];
  if (!target || process.argv.length !== 3) throw new Error("用法: pnpm card:check <目录|文件.vivicard>");
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), target), stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error("不支持符号链接");
  let definition;
  if (stat.isDirectory()) {
    const files: Record<string, Uint8Array> = {};
    const scan = async (folder: string, prefix = "") => {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const relative = prefix + entry.name, absolute = resolve(folder, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`${relative}: 不支持符号链接`);
        if (entry.isDirectory() && relative === "examples") await scan(absolute, `${relative}/`);
        else if (entry.isFile()) {
          if (Object.keys(files).length >= 32 || (await lstat(absolute)).size > 262144) throw new Error(`${relative}: 文件数/大小超过限制`);
          files[relative] = await readFile(absolute);
        } else throw new Error(`${relative}: 不支持的目录或文件`);
      }
    };
    await scan(path); definition = await parsePackageFiles(files);
  } else {
    if (stat.size > 1048576) throw new Error("压缩包超过 1 MiB");
    definition = await readPackageZip(await readFile(path));
  }
  console.log(JSON.stringify({ valid: true, id: definition.manifest.id, version: definition.manifest.version, hash: definition.hash, examples: definition.examples.length, live: "unsupported" }, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
