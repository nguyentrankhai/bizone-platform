import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "@/lib/storage";

/**
 * File part of the backup (P7.5): every object of the Payment Hub storage (dispute evidence,
 * P5.6) — the MinIO / S3 bucket or the local STORAGE_LOCAL_DIR, whichever `lib/storage.ts` uses.
 * Called by scripts/backup.sh / restore.sh (bundled: `node dist/backup-files.mjs`).
 *
 *   export <dir>   download every object to <dir>/objects/<key> + <dir>/index.json
 *   import <dir>   upload them back (same keys — existing objects are overwritten)
 *
 * Prints one JSON line `{ files, bytes, driver }`.
 */

interface IndexEntry {
  key: string;
  size: number;
  contentType: string | null;
}

async function exportAll(dir: string) {
  const storage = getStorage();
  const root = path.join(dir, "objects");
  await mkdir(root, { recursive: true });
  const index: IndexEntry[] = [];
  let bytes = 0;
  for await (const key of storage.list()) {
    const obj = await storage.get(key);
    if (!obj) continue; // deleted while listing
    const file = path.join(root, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, obj.body);
    index.push({ key, size: obj.body.length, contentType: obj.contentType });
    bytes += obj.body.length;
  }
  await writeFile(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  return { files: index.length, bytes, driver: storage.name };
}

async function importAll(dir: string) {
  const storage = getStorage();
  const root = path.join(dir, "objects");
  let index: IndexEntry[];
  try {
    index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as IndexEntry[];
  } catch {
    // no index (hand-made archive): every file under objects/
    const files = await readdir(root, { recursive: true }).catch(() => [] as string[]);
    index = [];
    for (const rel of files) {
      const st = await stat(path.join(root, rel));
      if (st.isFile())
        index.push({ key: rel.split(path.sep).join("/"), size: st.size, contentType: null });
    }
  }
  let bytes = 0;
  for (const e of index) {
    const body = await readFile(path.join(root, e.key));
    await storage.put(e.key, body, e.contentType ?? "application/octet-stream");
    bytes += body.length;
  }
  return { files: index.length, bytes, driver: storage.name };
}

async function main() {
  const [cmd, dir] = process.argv.slice(2);
  if ((cmd !== "export" && cmd !== "import") || !dir) {
    console.error("usage: backup-files <export|import> <dir>");
    process.exit(2);
  }
  const r =
    cmd === "export" ? await exportAll(path.resolve(dir)) : await importAll(path.resolve(dir));
  console.log(JSON.stringify(r));
}

main().catch((e: unknown) => {
  console.error(`[backup-files] ${(e as Error).message}`);
  process.exit(1);
});
