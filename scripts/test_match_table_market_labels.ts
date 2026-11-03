/**
 * SportsQuant Pro — MatchTable Market Labels & Payout Verification Test
 */

import { 
  identifyMarketType, 
  getMarketSlotLabels, 
  getMatchHitStatus,
  formatCategoryBadge
} from '../src/components/MatchTable';
import { MatchItem } from '../src/types';

function runMarketLabelTests() {
  console.log('=== [1] Testing Market Classification & Slot Labels ===');

  // 1. 축구 일반 승무패
  const soccer1X2: MatchItem = {
    gameNo: 1,
    date: '2026.10.14',
    league: 'EPL',
    sport: 'soccer',
    categoryType: '일반',
    categoryLabel: '일반',
    homeTeam: '아스널',
    awayTeam: '첼시',
    status: '종료',
    score: { home: 2, away: 1 },
    domestic: { win: 1.95, draw: 3.40, lose: 3.60, refundRate: '87.90%' },
    foreign: { win: 2.05, draw: 3.65, lose: 3.85, refundRate: '96.20%' },
    oddsSource: { domestic: 'real', foreign: 'real' },
    foreignBookmaker: 'Pinnacle'
  };

  const mTypeSoccer = identifyMarketType(soccer1X2);
  const slotsSoccer = getMarketSlotLabels(soccer1X2);
  const hitSoccer = getMatchHitStatus(soccer1X2);
  console.log('Soccer 1X2:', {
    marketType: mTypeSoccer,
    slot1: slotsSoccer.slot1,
    slot2: slotsSoccer.slot2,
    slot3: slotsSoccer.slot3,
    outcomeTag: hitSoccer.outcomeTag
  });
  if (slotsSoccer.slot1 !== '홈승' || slotsSoccer.slot2 !== '무승부' || slotsSoccer.slot3 !== '원정승' || hitSoccer.outcomeTag !== '홈승') {
    throw new Error('Soccer 1X2 failed labels or outcome');
  }

  // 2. 야구 일반 승패
  const baseballML: MatchItem = {
    gameNo: 2,
    date: '2026.10.14',
    league: 'MLB',
    sport: 'baseball',
    categoryType: '일반',
    categoryLabel: '일반',
    homeTeam: 'LA다저스',
    awayTeam: '샌디에이고',
    status: '종료',
    score: { home: 5, away: 3 },
    domestic: { win: 1.65, draw: null, lose: 2.15, refundRate: '88.10%' },
    foreign: { win: 1.72, draw: null, lose: 2.24, refundRate: '96.80%' },
    oddsSource: { domestic: 'real', foreign: 'real' },
    foreignBookmaker: 'Pinnacle'
  };

  const mTypeBaseball = identifyMarketType(baseballML);
  const slotsBaseball = getMarketSlotLabels(baseballML);
  const hitBaseball = getMatchHitStatus(baseballML);
  console.log('Baseball ML:', {
    marketType: mTypeBaseball,
    slot1: slotsBaseball.slot1,
    slot2: slotsBaseball.slot2,
    slot3: slotsBaseball.slot3,
    outcomeTag: hitBaseball.outcomeTag
  });
  if (slotsBaseball.slot1 !== '홈승' || slotsBaseball.slot2 !== null || slotsBaseball.slot3 !== '원정승' || hitBaseball.outcomeTag !== '홈승') {
    throw new Error('Baseball ML failed labels or outcome');
  }

  // 3. 야구 승1패
  const baseballW1L: MatchItem = {
    gameNo: 3,
    date: '2026.10.14',
    league: 'MLB',
    sport: 'baseball',
    categoryType: '승1패',
    categoryLabel: '승1패',
    homeTeam: 'LA다저스',
    awayTeam: '샌디에이고',
    status: '종료',
    score: { home: 4, away: 3 }, // 1 run diff -> "1"
    domestic: { win: 2.20, draw: 2.85, lose: 2.65, refundRate: '88.50%' },
    oddsSource: { domestic: 'real', foreign: 'unavailable' }
  };

  const mTypeW1L = identifyMarketType(baseballW1L);
  const slotsW1L = getMarketSlotLabels(baseballW1L);
  const hitW1L = getMatchHitStatus(baseballW1L);
  console.log('Baseball W1L (1 run diff):', {
    marketType: mTypeW1L,
    slot1: slotsW1L.slot1,
    slot2: slotsW1L.slot2,
    slot3: slotsW1L.slot3,
    outcomeTag: hitW1L.outcomeTag
  });
  if (slotsW1L.slot1 !== '승' || slotsW1L.slot2 !== '1' || slotsW1L.slot3 !== '패' || hitW1L.outcomeTag !== '1') {
    throw new Error('Baseball W1L failed labels or outcome');
  }

  // 4. 농구 승5패
  const basketballW5L: MatchItem = {
    gameNo: 4,
    date: '2026.10.14',
    league: 'NBA',
    sport: 'basketball',
    categoryType: '승1패', // WiseToto raw marker
    categoryLabel: '승5패',
    homeTeam: '보스턴',
    awayTeam: '밀워키',
    status: '종료',
    score: { home: 104, away: 100 }, // 4 pts diff -> "5"
    domestic: { win: 2.10, draw: 2.70, lose: 2.80, refundRate: '88.20%' },
    oddsSource: { domestic: 'real', foreign: 'unavailable' }
  };

  const mTypeW5L = identifyMarketType(basketballW5L);
  const slotsW5L = getMarketSlotLabels(basketballW5L);
  const hitW5L = getMatchHitStatus(basketballW5L);
  console.log('Basketball W5L (4 pts diff):', {
    marketType: mTypeW5L,
    slot1: slotsW5L.slot1,
    slot2: slotsW5L.slot2,
    slot3: slotsW5L.slot3,
    outcomeTag: hitW5L.outcomeTag
  });
  if (slotsW5L.slot1 !== '승' || slotsW5L.slot2 !== '5' || slotsW5L.slot3 !== '패' || hitW5L.outcomeTag !== '5') {
    throw new Error('Basketball W5L failed labels or outcome');
  }

  // 5. 핸디캡 (Handicap with criteria)
  const handicapMatch: MatchItem = {
    gameNo: 5,
    date: '2026.10.14',
    league: 'MLB',
    sport: 'baseball',
    categoryType: '핸디캡',
    categoryLabel: 'H -1.5',
    handicapLine: -1.5,
    homeTeam: 'LA다저스',
    awayTeam: '샌디에이고',
    status: '종료',
    score: { home: 5, away: 2 }, // 3 diff vs -1.5 -> 핸디승
    domestic: { win: 2.05, draw: null, lose: 1.70, refundRate: '88.30%' },
    oddsSource: { domestic: 'real', foreign: 'unavailable' }
  };

  const mTypeHandi = identifyMarketType(handicapMatch);
  const slotsHandi = getMarketSlotLabels(handicapMatch);
  const hitHandi = getMatchHitStatus(handicapMatch);
  console.log('Handicap:', {
    marketType: mTypeHandi,
    slot1: slotsHandi.slot1,
    slot2: slotsHandi.slot2,
    slot3: slotsHandi.slot3,
    marketName: slotsHandi.marketName,
    outcomeTag: hitHandi.outcomeTag
  });
  if (!slotsHandi.slot1.includes('-1.5') || slotsHandi.slot2 !== null || hitHandi.outcomeTag !== '핸디승') {
    throw new Error('Handicap failed labels or outcome');
  }

  // 6. 언더오버 (Under/Over)
  const uoMatch: MatchItem = {
    gameNo: 6,
    date: '2026.10.14',
    league: 'MLB',
    sport: 'baseball',
    categoryType: '언더오버',
    categoryLabel: 'U/O 8.5',
    uoLine: 8.5,
    homeTeam: 'LA다저스',
    awayTeam: '샌디에이고',
    status: '종료',
    score: { home: 4, away: 2 }, // total 6 < 8.5 -> 언더
    domestic: { win: 1.82, draw: null, lose: 1.82, refundRate: '88.00%' },
    oddsSource: { domestic: 'real', foreign: 'unavailable' }
  };

  const mTypeUO = identifyMarketType(uoMatch);
  const slotsUO = getMarketSlotLabels(uoMatch);
  const hitUO = getMatchHitStatus(uoMatch);
  console.log('Under/Over:', {
    marketType: mTypeUO,
    slot1: slotsUO.slot1,
    slot2: slotsUO.slot2,
    slot3: slotsUO.slot3,
    outcomeTag: hitUO.outcomeTag
  });
  if (!slotsUO.slot1.includes('언더') || !slotsUO.slot3.includes('오버') || hitUO.outcomeTag !== '언더') {
    throw new Error('Under/Over failed labels or outcome');
  }

  // 7. SUM (홀짝) - MUST NEVER BE 언더!
  const sumMatchWithScores: MatchItem = {
    gameNo: 7,
    date: '2026.10.14',
    league: '프로토',
    sport: 'soccer',
    categoryType: '일반',
    categoryLabel: 'SUM',
    homeTeam: 'A팀',
    awayTeam: 'B팀',
    status: '종료',
    score: { home: 2, away: 1 }, // total 3 (Odd) -> 홀
    domestic: { win: 1.85, draw: null, lose: 1.85, refundRate: '88.00%' },
    oddsSource: { domestic: 'real', foreign: 'unavailable' }
  };

  const mTypeSUM = identifyMarketType(sumMatchWithScores);
  const slotsSUM = getMarketSlotLabels(sumMatchWithScores);
  const hitSUM = getMatchHitStatus(sumMatchWithScores);
  console.log('SUM (Score Odd=3):', {
    marketType: mTypeSUM,
    slot1: slotsSUM.slot1,
    slot2: slotsSUM.slot2,
    slot3: slotsSUM.slot3,
    outcomeTag: hitSUM.outcomeTag
  });
  if (slotsSUM.slot1 !== '홀' || slotsSUM.slot3 !== '짝' || hitSUM.outcomeTag !== '홀') {
    throw new Error('SUM failed labels or outcome');
  }

  // 7b. SUM without scores or confirmed definition -> MUST BE UNAVAILABLE / empty outcomeTag (NEVER '언더')
  const sumMatchUnconfirmed: MatchItem = {
    gameNo: 8,
    date: '2026.10.14',
    league: '프로토',
    sport: 'soccer',
    categoryType: '일반',
    categoryLabel: 'SUM',
    homeTeam: 'C팀',
    awayTeam: 'D팀',
    status: '종료',
    score: null,
    rawResultTag: undefined,
    domestic: null,
    oddsSource: { domestic: 'unavailable', foreign: 'unavailable' }
  };

  const slotsUnconfirmed = getMarketSlotLabels(sumMatchUnconfirmed);
  const hitUnconfirmed = getMatchHitStatus(sumMatchUnconfirmed);
  console.log('SUM Unconfirmed:', {
    slot1: slotsUnconfirmed.slot1,
    slot3: slotsUnconfirmed.slot3,
    marketName: slotsUnconfirmed.marketName,
    outcomeTag: hitUnconfirmed.outcomeTag || '(empty/UNAVAILABLE)'
  });
  if (hitUnconfirmed.outcomeTag === '언더' || hitUnconfirmed.outcomeTag === '오버') {
    throw new Error('CRITICAL BUG: SUM unconfirmed returned 언더 or 오버!');
  }
  if (hitUnconfirmed.outcomeTag !== '') {
    throw new Error('SUM unconfirmed should return empty outcomeTag');
  }

  console.log('\n=== ALL 7 MARKET TESTS PASSED PERFECTLY ===\n');
}

runMarketLabelTests();
