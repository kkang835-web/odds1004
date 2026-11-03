import fs from "fs";
import path from "path";
import { collectRealHistoricalRound } from "../server/realHistory/realWisetotoCollector.js";
import { RealHistoricalRound } from "../server/realHistory/realHistoryTypes.js";

const DATASET_FILE = path.join(process.cwd(), "data", "realHistoricalDataset.json");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("==================================================");
  console.log("Re-collecting Clean UTF-8 WiseToto Historical Dataset");
  console.log("==================================================");

  if (!fs.existsSync(DATASET_FILE)) {
    console.error("Dataset file not found");
    return;
  }

  const existingRaw = fs.readFileSync(DATASET_FILE, "utf-8");
  const existingRounds: RealHistoricalRound[] = JSON.parse(existingRaw);

  console.log(`Found ${existingRounds.length} rounds in dataset to clean...`);

  const cleanRounds: RealHistoricalRound[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < existingRounds.length; i++) {
    const r = existingRounds[i];
    const key = `${r.sport}_${r.year}_${r.round}`;

    process.stdout.write(`[${i + 1}/${existingRounds.length}] Fetching ${key}... `);

    try {
      const cleanRound = await collectRealHistoricalRound(r.sport as any, r.year, r.round);
      if (cleanRound.matches && cleanRound.matches.length > 0) {
        cleanRounds.push(cleanRound);
        successCount++;
        console.log(`OK (${cleanRound.matches.length} matches, 1st: ${cleanRound.matches[0].homeTeam} vs ${cleanRound.matches[0].awayTeam})`);
      } else {
        // Keep existing if fetch yielded empty
        cleanRounds.push(r);
        console.log(`EMPTY (kept existing)`);
      }
    } catch (err: any) {
      errorCount++;
      cleanRounds.push(r);
      console.log(`ERROR (${err.message}) - kept existing`);
    }

    // Save progress every 20 rounds
    if ((i + 1) % 20 === 0 || i === existingRounds.length - 1) {
      fs.writeFileSync(DATASET_FILE, JSON.stringify(cleanRounds, null, 2), "utf-8");
      console.log(`💾 Progress saved (${cleanRounds.length} rounds written to ${DATASET_FILE})`);
    }

    await sleep(50);
  }

  console.log(`\n==================================================`);
  console.log(`Re-collection complete! Success: ${successCount}, Errors: ${errorCount}, Total saved: ${cleanRounds.length}`);
  console.log(`==================================================`);
}

main();
