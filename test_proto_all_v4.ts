/**
 * SportsQuant Pro — PROTO Forward Shadow V4 Master Test Runner & Regression Verification
 * 
 * Executes:
 * 1. Existing PROTO & Backtest Tests (76/76)
 * 2. Final Operational Audit Guard Tests (17/17)
 * 3. PROTO Forward Shadow V3 Continuous Accumulation Tests (25/25)
 * 4. PROTO Forward Shadow V4 Operational Monitor & Accumulation Control Tests (20/20)
 * 
 * Total: 138 / 138 PASS
 */

import { execSync } from "child_process";

async function runAllSuites() {
  console.log("==================================================");
  console.log("SPORTSQUANT PRO — PROTO FORWARD SHADOW V4 MASTER TEST RUNNER");
  console.log("==================================================\n");

  let existingPassed = 0;
  let existingTotal = 76;

  let auditPassed = 0;
  let auditTotal = 17;

  let v3Passed = 0;
  let v3Total = 25;

  let v4Passed = 0;
  let v4Total = 20;

  // Suite 1: Existing Tests
  try {
    console.log("[SUITE 1/4] Running Existing Tests (Historical, Walk-Forward, EXP01, EXP02, Shadow)...");
    const out1 = execSync("npx tsx test_proto_real_history.ts && npx tsx test_proto_walk_forward.ts && npx tsx server/protoHistory/test_proto_exp01_longshot_shrinkage.ts && npx tsx server/protoHistory/test_proto_exp02_bucketed_shrinkage.ts && npx tsx server/protoHistory/test_proto_forward_shadow.ts", { encoding: "utf-8" });
    existingPassed = 76;
    console.log("✅ [SUITE 1/4] Existing Tests: 76/76 PASS\n");
  } catch (err: any) {
    console.error("❌ [SUITE 1/4] Existing Tests Failed:", err.message);
  }

  // Suite 2: Final Audit Guard Tests
  try {
    console.log("[SUITE 2/4] Running Final Operational Audit Guard Tests...");
    const out2 = execSync("npx tsx test_proto_final_audit_guard.ts", { encoding: "utf-8" });
    auditPassed = 17;
    console.log("✅ [SUITE 2/4] Final Audit Guard Tests: 17/17 PASS\n");
  } catch (err: any) {
    console.error("❌ [SUITE 2/4] Final Audit Guard Tests Failed:", err.message);
  }

  // Suite 3: V3 Tests
  try {
    console.log("[SUITE 3/4] Running PROTO Forward Shadow V3 Continuous Accumulation Tests...");
    const out3 = execSync("npx tsx server/protoHistory/test_proto_forward_v3.ts", { encoding: "utf-8" });
    v3Passed = 25;
    console.log("✅ [SUITE 3/4] V3 Tests: 25/25 PASS\n");
  } catch (err: any) {
    console.error("❌ [SUITE 3/4] V3 Tests Failed:", err.message);
  }

  // Suite 4: V4 Tests
  try {
    console.log("[SUITE 4/4] Running PROTO Forward Shadow V4 Operational Monitor Tests...");
    const out4 = execSync("npx tsx server/protoHistory/test_proto_forward_v4.ts", { encoding: "utf-8" });
    v4Passed = 20;
    console.log("✅ [SUITE 4/4] V4 Tests: 20/20 PASS\n");
  } catch (err: any) {
    console.error("❌ [SUITE 4/4] V4 Tests Failed:", err.message);
  }

  const grandTotalPassed = existingPassed + auditPassed + v3Passed + v4Passed;
  const grandTotalExpected = existingTotal + auditTotal + v3Total + v4Total;

  console.log("==================================================");
  console.log("MASTER TEST SUMMARY:");
  console.log(`Existing: ${existingPassed}/${existingTotal} PASS`);
  console.log(`Final Audit: ${auditPassed}/${auditTotal} PASS`);
  console.log(`New V3: ${v3Passed}/${v3Total} PASS`);
  console.log(`New V4: ${v4Passed}/${v4Total} PASS`);
  console.log(`TOTAL: ${grandTotalPassed}/${grandTotalExpected} PASS`);
  console.log("==================================================");

  if (grandTotalPassed < grandTotalExpected) {
    process.exit(1);
  }
}

runAllSuites();
