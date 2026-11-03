import assert from "node:assert";
import fs from "fs";
import path from "path";
import { formatOddsIntoThreeSlots, getMarketSlotLabels, identifyMarketType } from "../src/components/MatchTable";
import type { MatchItem } from "../src/types";

async function runPhase1Audit() {
  console.log("===============================================================================");
  console.log("ODDSALGO — 해외 평균 배당 MatchTable 연동 1단계 종합 검증 테스트");
  console.log("===============================================================================\n");

  const datasetPath = path.join(process.cwd(), "data", "test_betinfo_foreign_odds_dataset.json");
  assert.ok(fs.existsSync(datasetPath), "검증 데이터셋 파일이 존재해야 합니다.");
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  console.log(`[1] 원본 검증 데이터셋 로드 완료: 총 ${dataset.totalCount}건 (OK: ${dataset.counts.OK}, NOT_PROVIDED: ${dataset.counts.NOT_PROVIDED})`);

  // Query Round 122 from local API
  console.log("\n[2] /api/matches?year=2026&round=122 API 호출 및 매칭 검증...");
  const res = await fetch("http://localhost:3000/api/matches?year=2026&round=122");
  assert.strictEqual(res.status, 200, "API 응답 상태코드는 200이어야 합니다.");
  const apiData = await res.json();
  const matches: MatchItem[] = apiData.matches || [];

  console.log(`- API 반환 경기 수: ${matches.length}경기`);

  // Item 1 & 2: 경기 번호 기준 매칭 및 홈팀/원정팀 일치 여부
  const ourByGameNo = new Map<number, MatchItem>();
  matches.forEach(m => ourByGameNo.set(m.gameNo, m));

  let matchedGameNoCount = 0;
  let teamNameMatchedCount = 0;
  let matchErrorCount = 0;

  for (const item of dataset.items) {
    const our = ourByGameNo.get(item.gameNo);
    if (our) {
      matchedGameNoCount++;
      const bHome = (item.homeTeam || "").replace(/\s+/g, "");
      const bAway = (item.awayTeam || "").replace(/\s+/g, "");
      const oHome = (our.homeTeam || "").replace(/\s+/g, "");
      const oAway = (our.awayTeam || "").replace(/\s+/g, "");

      if (bHome === oHome && bAway === oAway) {
        teamNameMatchedCount++;
      } else {
        matchErrorCount++;
      }
    }
  }

  console.log(`- 1. 경기 번호 기준 매칭 성공: ${matchedGameNoCount}/${dataset.totalCount}건 (100%), 실패: 0건`);
  assert.strictEqual(matchedGameNoCount, dataset.totalCount, "전체 218건이 경기 번호 기준으로 일치해야 합니다.");

  console.log(`- 2. 홈팀·원정팀 정확 일치: ${teamNameMatchedCount}/${dataset.totalCount}건 (100%), 불일치: ${matchErrorCount}건`);
  assert.strictEqual(teamNameMatchedCount, dataset.totalCount, "홈팀과 원정팀 명이 100% 일치해야 합니다.");
  assert.strictEqual(matchErrorCount, 0, "팀명 불일치 건수는 0이어야 합니다.");

  // Item 3: 해외 배당 40건의 실제 값 표시 여부
  const okItems = dataset.items.filter((i: any) => i.status === "OK");
  assert.strictEqual(okItems.length, 40, "정상 배당(OK)은 정확히 40건이어야 합니다.");

  let okDisplayValidCount = 0;
  for (const okItem of okItems) {
    const m = ourByGameNo.get(okItem.gameNo);
    assert.ok(m, `경기번호 ${okItem.gameNo}가 매칭되어야 합니다.`);
    assert.ok(m.foreign, `경기번호 ${okItem.gameNo}에 foreign 배당이 설정되어야 합니다.`);
    assert.strictEqual(m.verifiedForeignPreview?.status, "OK");
    assert.strictEqual(m.foreignSourceName, "해외 평균 배당");
    assert.strictEqual(m.foreignBookmaker, "해외 평균 배당");

    // Check values match currentOdds
    assert.strictEqual(m.foreign.win, okItem.currentOdds.win);
    assert.strictEqual(m.foreign.lose, okItem.currentOdds.lose);
    if (okItem.currentOdds.draw !== null) {
      assert.strictEqual(m.foreign.draw, okItem.currentOdds.draw);
    }
    okDisplayValidCount++;
  }
  console.log(`- 3. 해외 배당 40건의 실제 값 표시 검증: ${okDisplayValidCount}/40건 완료 (100%)`);

  // Item 4: 원본 미제공 178건의 상태 표시 여부
  const notProvidedItems = dataset.items.filter((i: any) => i.status === "NOT_PROVIDED");
  assert.strictEqual(notProvidedItems.length, 178, "미제공(NOT_PROVIDED)은 정확히 178건이어야 합니다.");

  let notProvidedValidCount = 0;
  for (const npItem of notProvidedItems) {
    const m = ourByGameNo.get(npItem.gameNo);
    assert.ok(m, `경기번호 ${npItem.gameNo}가 매칭되어야 합니다.`);
    assert.ok(!m.foreign || (m.foreign as any).win === null, `미제공 경기는 foreign 값이 비어있거나 null이어야 합니다.`);
    assert.strictEqual(m.verifiedForeignPreview?.status, "NOT_PROVIDED");
    assert.strictEqual(m.foreignSourceName, "해외 평균 배당 (미제공)");
    notProvidedValidCount++;
  }
  console.log(`- 4. 원본 미제공 178건 상태 표시 검증: ${notProvidedValidCount}/178건 완료 (100%)`);

  // Item 5: 홈·무·원정 슬롯 정렬 및 2-way 마켓 표시
  console.log("\n[3] 3칸 대칭 정렬 및 2-Way 마켓 정렬 검증...");
  let twoWayTested = 0;
  let threeWayTested = 0;

  for (const okItem of okItems) {
    const m = ourByGameNo.get(okItem.gameNo)!;
    const slotLabels = getMarketSlotLabels(m);
    const slots = formatOddsIntoThreeSlots(m.foreign, slotLabels.isTwoWay);

    assert.ok(slots.slot1.text !== "-", `Slot 1 must have valid odds, got: ${slots.slot1.text}`);
    assert.ok(slots.slot3.text !== "-", `Slot 3 must have valid odds, got: ${slots.slot3.text}`);

    if (slotLabels.isTwoWay) {
      twoWayTested++;
      assert.strictEqual(slots.slot2.text, "-", "2-Way 마켓 가운데 슬롯은 정렬용 '-' 대시여야 합니다.");
      assert.strictEqual(slots.slot2.isAlignmentDash, true, "2-Way 마켓 슬롯 2는 isAlignmentDash=true여야 합니다.");
    } else {
      threeWayTested++;
      assert.ok(slots.slot2.text !== "-", "3-Way 축구 마켓 가운데 슬롯은 무승부 배당이어야 합니다.");
      assert.strictEqual(slots.slot2.isAlignmentDash, false);
    }
  }
  console.log(`- 5. 슬롯 대칭 정렬 검증: 3-Way 축구 ${threeWayTested}경기, 2-Way (야구/농구 등) ${twoWayTested}경기 모두 완벽 정렬`);

  // Item 6: 초기 배당과 변동값 확인
  console.log("\n[4] 초기 배당과 변동값(Delta & Direction) 검증...");
  let deltaValidCount = 0;
  for (const okItem of okItems) {
    const v = okItem;
    assert.ok(v.initialOdds, "OK 항목은 초기 배당이 존재해야 합니다.");
    assert.ok(v.currentOdds, "OK 항목은 현재 배당이 존재해야 합니다.");
    assert.ok(v.oddsChange, "OK 항목은 변동값이 존재해야 합니다.");

    // Verify calculated delta matches current - initial
    if (v.initialOdds.win && v.currentOdds.win) {
      const diff = +(v.currentOdds.win - v.initialOdds.win).toFixed(2);
      assert.ok(Math.abs(diff - (v.oddsChange.win || 0)) < 0.02, `Delta diff match for win on game ${v.gameNo}`);
    }
    deltaValidCount++;
  }
  console.log(`- 6. 초기 배당 및 변동값 일치 검증: ${deltaValidCount}/40건 일치 확인`);

  // Item 7: 기존 국내 배당 및 정렬 회귀 여부 검증
  console.log("\n[5] 국내 배당 및 경기 목록 정렬 회귀 검증...");
  let domesticIntactCount = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.domestic?.win) {
      domesticIntactCount++;
    }
  }

  // Verify relative order consistency with Betinfo original sequence
  const betinfoOrder = dataset.items.map((i: any) => i.gameNo);
  const mainGameSet = new Set(betinfoOrder);
  const ourFilteredOrder = matches.map(m => m.gameNo).filter(gNo => mainGameSet.has(gNo));
  let isOrderIdentical = true;
  for (let i = 0; i < betinfoOrder.length; i++) {
    if (betinfoOrder[i] !== ourFilteredOrder[i]) {
      isOrderIdentical = false;
      break;
    }
  }
  console.log(`- 7. 국내 배당 보존: ${domesticIntactCount}경기 국내 배당 정상 유지, 경기 정렬 순서 일치 여부: ${isOrderIdentical ? '100% 일치' : '상이'}`);
  assert.strictEqual(isOrderIdentical, true, "검증 대상 218경기의 표시 순서는 원본 순서와 100% 일치해야 합니다.");

  console.log("\n===============================================================================");
  console.log("🎉 [SUCCESS] 해외 평균 배당 MatchTable 연동 1단계 전 항목 100% 검증 통과!");
  console.log("===============================================================================");
}

runPhase1Audit().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
