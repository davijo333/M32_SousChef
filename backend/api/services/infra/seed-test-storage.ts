import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const CATALOG_DIRS = ["dishes", "ingredients", "addons"] as const;

function resolveRepoRoot(): string {
  const configured = process.env.REPO_ROOT?.trim();
  if (configured && fs.existsSync(path.join(configured, "test/inventory/ingredients.json"))) {
    return configured;
  }
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), "../.."),
    path.join(process.cwd(), "../../.."),
    "/app",
  ];
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, "test/inventory/ingredients.json"))) {
      return root;
    }
  }
  throw new Error("Could not find repo root (test/inventory/ingredients.json)");
}

export function resolveTestStorageR2Root(): string {
  return path.join(resolveRepoRoot(), "test/storage/r2");
}

export function resolveLiveR2Root(): string {
  const configured = process.env.R2_STORAGE_ROOT;
  if (configured) return path.resolve(configured);
  return path.join(resolveRepoRoot(), "storage/r2");
}

async function copyTree(srcDir: string, destDir: string): Promise<number> {
  let copied = 0;
  await fsp.mkdir(destDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += await copyTree(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
      copied += 1;
    }
  }
  return copied;
}

/** Copy committed test catalog images into the live R2 mirror before seeding. */
export async function syncTestCatalogImagesToR2(): Promise<{ copied: number; source: string }> {
  const testRoot = resolveTestStorageR2Root();
  const liveRoot = resolveLiveR2Root();
  let copied = 0;

  for (const dir of CATALOG_DIRS) {
    const src = path.join(testRoot, dir);
    if (!fs.existsSync(src)) continue;
    copied += await copyTree(src, path.join(liveRoot, dir));
  }

  return { copied, source: testRoot };
}

/** Snapshot live catalog images into test/storage/r2 (for committing to git). */
export async function captureCatalogImagesToTestStorage(): Promise<{ copied: number; dest: string }> {
  const testRoot = resolveTestStorageR2Root();
  const liveRoot = resolveLiveR2Root();
  let copied = 0;

  for (const dir of CATALOG_DIRS) {
    const src = path.join(liveRoot, dir);
    if (!fs.existsSync(src)) continue;
    copied += await copyTree(src, path.join(testRoot, dir));
  }

  return { copied, dest: testRoot };
}
