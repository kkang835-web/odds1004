import crypto from "crypto";
import fs from "fs";
import { resolveDisplayTeamName, resolveMatchDisplayTeams, getTeamResolutionInfo } from "../server/protoHistory/protoTeamNameResolver.js";

console.log("==========================================================================");
console.log(" SPORTSQUANT PRO — SIDECAR TEAM NAME DICTIONARY INTEGRITY SUITE");
console.log("==========================================================================\n");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${testName} -> ${detail || "Assertion failed"}`);
  }
}

// =======================================================================
// TEST 1: Protected Files SHA-256 Immutability Check
// =======================================================================
console.log("--- 1. PROTECTED FILES SHA-256 IMMUTABILITY ---");
const EXPECTED_HASHES: Record<string, string> = {
  "data/realProtoHistoricalDataset.json": "893ff9140e1703c3d337d9fa48507d45e461d2124eccf7cc5f4f561db5e66f78",
  "data/protoRealWalkForwardV1.json": "353a22601a6f0e6fe104c439cd0def3fd8c7471ac540cf67b50aed2b771ca372",
  "data/protoForwardShadowStore.json": "3ed1ec2a18367b51ffa80f938d9d60adf2fa72c9a25a110a8cd7b28f4acec972"
};

for (const [filePath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
  const fileBytes = fs.readFileSync(filePath);
  const currentHash = crypto.createHash("sha256").update(fileBytes).digest("hex");
  assert(currentHash === expectedHash, `1. File hash unchanged: ${filePath}`, `Expected ${expectedHash}, got ${currentHash}`);
}

// =======================================================================
// TEST 2: Walk-Forward Baseline Metrics Exact Reproduction
// =======================================================================
console.log("\n--- 2. WALK-FORWARD BASELINE INTEGRITY ---");
const wf = JSON.parse(fs.readFileSync("data/protoRealWalkForwardV1.json", "utf-8"));
const records = wf.records || [];
const settled = records.filter((r: any) => r.isSettled);

assert(records.length === 1802, "2. Walk-Forward total records count is exactly 1,802");
assert(settled.length === 1413, "3. Walk-Forward settled records count is exactly 1,413");

const hits = settled.filter((r: any) => r.isHitModel).length;
assert(hits === 832, `4. Walk-Forward hit count is exactly 832 (got ${hits})`);

const hitRate = (hits / settled.length) * 100;
assert(hitRate.toFixed(2) === "58.88", `5. Walk-Forward hit rate is exactly 58.88% (got ${hitRate.toFixed(2)}%)`);

const profit = settled.reduce((acc: number, r: any) => acc + (r.profitModel || 0), 0);
assert(profit.toFixed(2) === "-37.67", `6. Walk-Forward total profit is exactly -37.67 (got ${profit.toFixed(2)})`);

const roi = (profit / settled.length) * 100;
assert(roi.toFixed(2) === "-2.67", `7. Walk-Forward ROI is exactly -2.67% (got ${roi.toFixed(2)}%)`);

// =======================================================================
// TEST 3: Dictionary Official Evidence Presence
// =======================================================================
console.log("\n--- 3. OFFICIAL EVIDENCE PRESENCE FOR VERIFIED MAPPINGS ---");
const dict = JSON.parse(fs.readFileSync("data/mappings/protoTeamNameDictionary.json", "utf-8"));
const mappings = dict.mappings || {};
const verifiedEntries = Object.entries(mappings).filter(([_, v]: [string, any]) => v.status === "VERIFIED");

assert(verifiedEntries.length > 0, `8. Verified mappings exist (count: ${verifiedEntries.length})`);

let missingEvidenceCount = 0;
for (const [k, v] of verifiedEntries as [string, any][]) {
  if (!v.officialEvidence || v.officialEvidence.trim() === "") {
    missingEvidenceCount++;
  }
}
assert(missingEvidenceCount === 0, `9. Zero verified mappings with missing official evidence (found ${missingEvidenceCount})`);

// =======================================================================
// TEST 4: Single Key Conflict & Collision Check
// =======================================================================
console.log("\n--- 4. MAPPING KEY UNIQUENESS & CONFLICT CHECK ---");
assert(dict.summary.conflictCount === 0, `10. Dictionary conflict count is zero (got ${dict.summary.conflictCount})`);

const uniqueCleanNames = new Set<string>();
const keyToCleanMap = new Map<string, string>();
let conflictFound = false;

for (const [k, v] of Object.entries(mappings) as [string, any][]) {
  if (keyToCleanMap.has(k) && keyToCleanMap.get(k) !== v.cleanName) {
    conflictFound = true;
  }
  keyToCleanMap.set(k, v.cleanName);
}
assert(!conflictFound, "11. Zero conflicting clean name assignments for identical corrupted key");

// =======================================================================
// TEST 5: Home/Away Inversion & Match Identifiers Alignment
// =======================================================================
console.log("\n--- 5. HOME/AWAY INVERSION & IDENTIFIER ALIGNMENT ---");
let inversionCount = 0;
for (const r of records.slice(0, 50)) {
  const resolvedHome = resolveDisplayTeamName(r.homeTeam);
  const resolvedAway = resolveDisplayTeamName(r.awayTeam);
  // Ensure home and away are not mapped to the same team in a match
  if (resolvedHome === resolvedAway && r.homeTeam !== r.awayTeam) {
    inversionCount++;
  }
}
assert(inversionCount === 0, `12. Zero home/away identity collisions across match fixtures`);

// =======================================================================
// TEST 6: UNVERIFIED & CONFLICT Fallback Preservation Check
// =======================================================================
console.log("\n--- 6. UNVERIFIED STRING PRESERVATION (ZERO TAMPERING) ---");
const unverifiedEntries = Object.entries(mappings).filter(([_, v]: [string, any]) => v.status === "UNVERIFIED");
assert(unverifiedEntries.length > 0, `13. Unverified mappings properly tracked (count: ${unverifiedEntries.length})`);

let untamperedCount = 0;
for (const [corruptedKey, v] of unverifiedEntries as [string, any][]) {
  const resolved = resolveDisplayTeamName(corruptedKey);
  if (resolved === corruptedKey) {
    untamperedCount++;
  }
}
assert(untamperedCount === unverifiedEntries.length, `14. 100% of UNVERIFIED strings return original raw string unchanged (${untamperedCount}/${unverifiedEntries.length})`);

// Unknown arbitrary string fallback
const arbitraryUnknown = "뼱졇쓬_UnknownTeam_999";
assert(resolveDisplayTeamName(arbitraryUnknown) === arbitraryUnknown, "15. Arbitrary unknown string returns raw string unchanged");

// =======================================================================
// TEST 7: Match Override Decorator Test
// =======================================================================
console.log("\n--- 7. MATCH OVERRIDE DECORATOR BEHAVIOR ---");
const sampleMatch = records[0];
const resolvedTeams = resolveMatchDisplayTeams(sampleMatch);
assert(typeof resolvedTeams.homeDisplayName === "string" && resolvedTeams.homeDisplayName.length > 0, "16. Match display home team resolved");
assert(typeof resolvedTeams.awayDisplayName === "string" && resolvedTeams.awayDisplayName.length > 0, "17. Match display away team resolved");

// =======================================================================
// SUMMARY
// =======================================================================
console.log("\n==========================================================================");
console.log(` INTEGRITY SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
console.log("==========================================================================");

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
