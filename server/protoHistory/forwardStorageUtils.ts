import fs from "fs";
import path from "path";
import zlib from "zlib";

const DATA_DIR = path.resolve(process.cwd(), "data");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

/**
 * Performs a highly resilient atomic write by saving to a temp file, fsync-ing, and renaming.
 */
export function atomicWrite(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, content, "utf-8");

  try {
    const fd = fs.openSync(tmpPath, "r+");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (err) {
    // Ignore fsync failures on platforms/filesystems that do not support it
  }

  fs.renameSync(tmpPath, filePath);
}

/**
 * Handles corrupted JSON by backing up the original to a corrupted file and throwing an error.
 */
export function handleCorruptedFile(filePath: string, error: any): never {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptedPath = `${filePath}.corrupted.${timestamp}`;

  console.error(`[CRITICAL STORAGE ERROR] Corrupted JSON detected at ${filePath}. Parsing failed:`, error);

  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, corruptedPath);
      console.error(`[CRITICAL STORAGE ERROR] Corrupted file has been preserved at: ${corruptedPath}`);
    }
  } catch (backupErr) {
    console.error(`[CRITICAL STORAGE ERROR] Failed to create corrupted backup file:`, backupErr);
  }

  throw new Error(`CORRUPTED_JSON_DETECTED: File at ${filePath} is corrupted. Original preserved at ${corruptedPath}. Overwrite prevented.`);
}

/**
 * Creates a gzipped backup snapshot of the given store.
 */
export function backupStore(filePath: string, storeName: string, storeObj: any): string | null {
  try {
    if (!storeObj || typeof storeObj !== "object") {
      throw new Error("Invalid store object for backup.");
    }

    // Schema basic check before backing up
    if (!storeObj.rounds) {
      throw new Error("Store rounds object is missing.");
    }

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/T/, "_").replace(/[:.]/g, "-").substring(0, 19);
    const backupFileName = `${storeName}_${timestamp}.json.gz`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);

    const jsonStr = JSON.stringify(storeObj, null, 2);
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, "utf-8"));

    fs.writeFileSync(backupPath, compressed);
    console.log(`[BACKUP SUCCESS] Snapshot created at ${backupPath}`);
    return backupPath;
  } catch (err: any) {
    console.error(`[BACKUP FAILURE] Failed to write backup for ${storeName}:`, err);
    // Write an operation log entry or output error to warn operational flow
    return null;
  }
}

/**
 * Rotates the backups for the given store name to only keep the latest N backups.
 * Excludes corrupted files or manual backups.
 */
export function rotateBackups(storeName: string, maxBackups = 30): void {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;

    const files = fs.readdirSync(BACKUPS_DIR);
    // Support both format with hyphens (YYYY-MM-DD_HH-MM-SS) and compact (YYYYMMDD_HHMMSS)
    const pattern = new RegExp(`^${storeName}_(?:\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}|\\d{8}_\\d{6})\\.json\\.gz$`);

    const matchingFiles = files
      .filter(file => pattern.test(file))
      .map(file => ({
        name: file,
        filePath: path.join(BACKUPS_DIR, file),
        mtime: fs.statSync(path.join(BACKUPS_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => a.mtime - b.mtime); // Oldest first

    if (matchingFiles.length > maxBackups) {
      const deleteCount = matchingFiles.length - maxBackups;
      for (let i = 0; i < deleteCount; i++) {
        fs.unlinkSync(matchingFiles[i].filePath);
        console.log(`[BACKUP ROTATION] Deleted oldest backup file: ${matchingFiles[i].name}`);
      }
    }
  } catch (err) {
    console.error(`[BACKUP ROTATION FAILURE] Error during backup rotation for ${storeName}:`, err);
  }
}

/**
 * Decompresses and dry-run restores a backup file, validating its schema and contents.
 */
export function verifyBackupDryRun(backupPath: string): { isValid: boolean; error?: string; stats?: any } {
  try {
    if (!fs.existsSync(backupPath)) {
      return { isValid: false, error: "Backup file does not exist." };
    }

    const compressedBuffer = fs.readFileSync(backupPath);
    const decompressed = zlib.gunzipSync(compressedBuffer);
    const jsonStr = decompressed.toString("utf-8");
    const store = JSON.parse(jsonStr);

    if (!store || typeof store !== "object") {
      return { isValid: false, error: "Parsed JSON is not an object." };
    }

    if (!store.version || !store.environment) {
      return { isValid: false, error: "Missing required store version or environment header." };
    }

    if (!store.rounds || typeof store.rounds !== "object") {
      return { isValid: false, error: "Missing or invalid rounds object." };
    }

    // Count rounds and matches for validation stats
    let roundCount = 0;
    let matchCount = 0;
    let settledCount = 0;
    let pendingCount = 0;
    let predictionCount = 0;

    for (const r of Object.values(store.rounds) as any[]) {
      roundCount++;
      if (r.matches && Array.isArray(r.matches)) {
        for (const m of r.matches) {
          matchCount++;
          if (m.snapshotStatus === "EVALUATED") {
            settledCount++;
          } else if (m.snapshotStatus === "PREDICTED") {
            predictionCount++;
          } else if (m.snapshotStatus === "RESULT_PENDING") {
            pendingCount++;
          }
        }
      }
    }

    return {
      isValid: true,
      stats: {
        roundCount,
        matchCount,
        settledCount,
        pendingCount,
        predictionCount
      }
    };
  } catch (err: any) {
    return { isValid: false, error: err.message || String(err) };
  }
}

/**
 * Returns a list of available backups with file info.
 */
export function listBackups(storeName?: string): Array<{
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  mtime: number;
}> {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];

    const files = fs.readdirSync(BACKUPS_DIR);
    return files
      .filter(f => !storeName || f.startsWith(storeName))
      .filter(f => f.endsWith(".json.gz"))
      .map(file => {
        const fullPath = path.join(BACKUPS_DIR, file);
        const stat = fs.statSync(fullPath);
        return {
          fileName: file,
          filePath: fullPath,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          mtime: stat.mtime.getTime()
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (err) {
    console.error("[BACKUP LIST ERROR]", err);
    return [];
  }
}

/**
 * Gets the most recent backup for a given store.
 */
export function getLatestBackup(storeName: string): {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  mtime: number;
} | null {
  const backups = listBackups(storeName);
  return backups.length > 0 ? backups[0] : null;
}
