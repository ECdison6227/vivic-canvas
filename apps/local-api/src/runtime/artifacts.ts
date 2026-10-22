import { createHash, randomUUID } from "node:crypto";
import { createReadStream, renameSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

export const LOCAL_DECISION_ARTIFACTS = {
  engine: { name: "llama-b9660-bin-win-vulkan-x64.zip", bytes: 38534318,
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b9660/llama-b9660-bin-win-vulkan-x64.zip",
    sha256: "7c5f7d3830279068dc8078ed0fcf1420b0dcd18f20a78383b083258cb1e4790a" },
  model: { name: "qwen2.5-0.5b-instruct-q4_k_m.gguf", bytes: 491400032,
    url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/9217f5db79a29953eb74d5343926648285ec7e67/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db" },
} as const;
export type Artifact = { name: string; bytes: number; url: string; sha256: string };
export async function matchesArtifact(file: string, artifact: Pick<Artifact, "bytes" | "sha256">): Promise<boolean> {
  try {
    if ((await fs.stat(file)).size !== artifact.bytes) return false;
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest("hex") === artifact.sha256;
  } catch { return false; }
}
export async function ensureArtifact(root: string, artifact: Artifact, signal: AbortSignal,
  progress: (bytes: number) => void, fetchImpl = fetch): Promise<void> {
  const target = path.join(root, artifact.name);
  if (await matchesArtifact(target, artifact)) { signal.throwIfAborted(); progress(artifact.bytes); return; }
  signal.throwIfAborted(); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = path.join(root, `${artifact.name}.${randomUUID()}.part`);
  const output = await fs.open(temporary, "wx", 0o600);
  let response: Response | undefined;
  try {
    response = await fetchImpl(artifact.url, { signal, credentials: "omit", redirect: "follow" });
    if (!response.ok || !response.body) throw new Error("artifact_unavailable");
    const reader = response.body.getReader(), digest = createHash("sha256"); let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted(); const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length; if (bytes > artifact.bytes) throw new Error("artifact_size");
        digest.update(chunk.value); let offset = 0;
        while (offset < chunk.value.length) { const result = await output.write(chunk.value.subarray(offset)); if (!result.bytesWritten) throw new Error("artifact_write"); offset += result.bytesWritten; }
        progress(bytes);
      }
    } finally { await reader.cancel().catch(() => {}); }
    await output.close(); signal.throwIfAborted();
    if (bytes !== artifact.bytes || digest.digest("hex") !== artifact.sha256) throw new Error("artifact_checksum");
    // No await between cancellation check and commit; an accepted cancel cannot install a late file.
    renameSync(temporary, target); progress(artifact.bytes);
  } finally { await output.close().catch(() => {}); await fs.rm(temporary, { force: true }).catch(() => {}); }
}
/** Extract only a previously verified engine archive into its dedicated installation directory. */
export async function installEngine(root: string, signal: AbortSignal) {
  const engine = LOCAL_DECISION_ARTIFACTS.engine, archive = path.join(root, engine.name);
  if (!await matchesArtifact(archive, engine)) throw new Error("engine_checksum");
  signal.throwIfAborted(); const files = unzipSync(await fs.readFile(archive));
  if (Object.keys(files).length > 256) throw new Error("engine_archive_limit");
  const destination = path.join(root, "engine"); await fs.mkdir(destination, { recursive: true });
  const receipt: Record<string, { bytes: number; sha256: string }> = {};
  let expanded = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "." || name === "..") throw new Error("engine_archive_path");
    expanded += data.length; if (expanded > 512 * 1024 * 1024) throw new Error("engine_archive_limit");
    signal.throwIfAborted(); await fs.writeFile(path.join(destination, name), data);
    receipt[name] = { bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  }
  if (!receipt["llama-server.exe"]) throw new Error("engine_missing");
  signal.throwIfAborted(); await fs.writeFile(path.join(destination, "receipt.json"), JSON.stringify(receipt), { mode: 0o600 });
}
export async function installedEngine(root: string) {
  try {
    const receipt = JSON.parse(await fs.readFile(path.join(root, "engine", "receipt.json"), "utf8")) as Record<string, { bytes: number; sha256: string }>;
    if (!receipt["llama-server.exe"] || Object.keys(receipt).length > 256) return false;
    for (const [name, record] of Object.entries(receipt)) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "." || name === ".." || !await matchesArtifact(path.join(root, "engine", name), record)) return false;
    }
    return true;
  } catch { return false; }
}
