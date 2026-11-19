import fs from 'fs';
import path from 'path';

export interface OddsTickSnapshot {
  time: string; // HH:mm KST or label
  timestamp: string; // ISO
  win: number;
  draw: number | null;
  lose: number;
  source: 'betman' | 'wisetoto_foreign' | 'espn_open' | 'espn_current';
}

export interface MatchOddsSnapshotsRecord {
  matchKey: string;
  year: number;
  round: number;
  gameNo: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  categoryLabel: string;
  domesticTicks: OddsTickSnapshot[];
  foreignTicks: OddsTickSnapshot[];
}

export interface OddsChangeFeedItem {
  gameNo: number;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  categoryLabel: string;
  marketSide: 'domestic' | 'foreign';
  sourceLabel: string;
  direction: 'up' | 'down' | 'mixed';
  previousOdds: { win: number; draw: number | null; lose: number };
  currentOdds: { win: number; draw: number | null; lose: number };
  winDropPct: number;
  loseDropPct: number;
  bookmakerCount?: number;
  signalTag: string;
  observedAt: string;
}

const SNAPSHOT_FILE = path.join(process.cwd(), 'data', 'odds_snapshots.json');
const snapshotStore = new Map<string, MatchOddsSnapshotsRecord>();
let storeLoaded = false;

function formatKstTime(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function loadStoreOnce() {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v === 'object') {
            snapshotStore.set(k, v as MatchOddsSnapshotsRecord);
          }
        }
      }
    }
  } catch {
    // Ignore corrupt snapshot file on startup
  }
}

let lastPersistTime = 0;
function persistStoreThrottled() {
  const now = Date.now();
  if (now - lastPersistTime < 15_000) return;
  lastPersistTime = now;
  try {
    const dir = path.dirname(SNAPSHOT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep at most latest 1500 match keys to avoid unbounded file growth
    const entries = [...snapshotStore.entries()];
    const trimmed = entries.length > 1500 ? entries.slice(entries.length - 1500) : entries;
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(Object.fromEntries(trimmed)), 'utf8');
  } catch {
    // Ignore write failure in read-only env
  }
}

function appendTickIfChanged(ticks: OddsTickSnapshot[], nextTick: OddsTickSnapshot) {
  if (!nextTick.win || !nextTick.lose || nextTick.win <= 1.0 || nextTick.lose <= 1.0) return;
  const last = ticks[ticks.length - 1];
  if (!last) {
    ticks.push(nextTick);
    return;
  }
  const sameValues =
    Math.abs(last.win - nextTick.win) < 0.005 &&
    Math.abs((last.draw || 0) - (nextTick.draw || 0)) < 0.005 &&
    Math.abs(last.lose - nextTick.lose) < 0.005;

  if (!sameValues) {
    ticks.push(nextTick);
    if (ticks.length > 16) ticks.shift();
  }
}

export function recordAndAttachOddsSnapshots(matches: any[], year: number, round: number) {
  if (!Array.isArray(matches) || matches.length === 0) return;
  loadStoreOnce();
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const nowTime = formatKstTime(nowDate);

  for (const m of matches) {
    const key = `${year}_${round}_${m.gameNo}`;
    let rec = snapshotStore.get(key);
    if (!rec) {
      rec = {
        matchKey: key,
        year,
        round,
        gameNo: Number(m.gameNo),
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league,
        sport: m.sport,
        categoryLabel: m.categoryLabel || '일반',
        domesticTicks: [],
        foreignTicks: []
      };
      snapshotStore.set(key, rec);
    }

    // 1. Record Domestic tick
    if (m.domestic?.win && m.domestic?.lose) {
      appendTickIfChanged(rec.domesticTicks, {
        time: nowTime,
        timestamp: nowIso,
        win: m.domestic.win,
        draw: m.domestic.draw ?? null,
        lose: m.domestic.lose,
        source: 'betman'
      });
    }

    // 2. Record Foreign opening (from ESPN DraftKings open) if available and not already seeded
    if (m.foreignOpening?.win && m.foreignOpening?.lose && rec.foreignTicks.length === 0) {
      rec.foreignTicks.push({
        time: '개장',
        timestamp: nowIso,
        win: m.foreignOpening.win,
        draw: m.foreignOpening.draw ?? null,
        lose: m.foreignOpening.lose,
        source: 'espn_open'
      });
    }

    // 3. Record Foreign current tick (WiseToto average or ESPN)
    if (m.foreign?.win && m.foreign?.lose && m.oddsSource?.foreign === 'real') {
      appendTickIfChanged(rec.foreignTicks, {
        time: nowTime,
        timestamp: nowIso,
        win: m.foreign.win,
        draw: m.foreign.draw ?? null,
        lose: m.foreign.lose,
        source: 'wisetoto_foreign'
      });
    }

    // 4. Attach foreignBookmakerCount
    if (Array.isArray(m.foreignBookmakers) && m.foreignBookmakers.length > 0) {
      m.foreignBookmakerCount = m.foreignBookmakers.length;
    }

    // 5. Attach observed oddsHistory if >= 2 real distinct points exist and m.oddsHistory wasn't already populated by BetMan
    if ((!m.oddsHistory || m.oddsHistory.length < 2) && rec.foreignTicks.length >= 2) {
      m.oddsHistory = rec.foreignTicks.map(t => ({
        time: t.time,
        item1: t.win,
        itemDraw: t.draw ?? undefined,
        item2: t.lose,
        win: t.win,
        draw: t.draw,
        lose: t.lose,
        isObserved: true
      }));
    } else if ((!m.oddsHistory || m.oddsHistory.length < 2) && rec.domesticTicks.length >= 2) {
      m.oddsHistory = rec.domesticTicks.map(t => ({
        time: t.time,
        item1: t.win,
        itemDraw: t.draw ?? undefined,
        item2: t.lose,
        win: t.win,
        draw: t.draw,
        lose: t.lose,
        isObserved: true
      }));
    }
  }

  persistStoreThrottled();
}

export function buildOddsChangesFeed(matches: any[], year: number, round: number): OddsChangeFeedItem[] {
  loadStoreOnce();
  const items: OddsChangeFeedItem[] = [];

  for (const m of matches) {
    const key = `${year}_${round}_${m.gameNo}`;
    const rec = snapshotStore.get(key);

    // Check BetMan/Observed Domestic changes
    if (Array.isArray(m.oddsHistory) && m.oddsHistory.length >= 2) {
      const first = m.oddsHistory[0];
      const last = m.oddsHistory[m.oddsHistory.length - 1];
      const prevW = first.win ?? first.item1;
      const curW = last.win ?? last.item1;
      const prevL = first.lose ?? first.item2;
      const curL = last.lose ?? last.item2;
      if (prevW > 1 && curW > 1 && prevL > 1 && curL > 1) {
        const winDropPct = Number((((curW - prevW) / prevW) * 100).toFixed(1));
        const loseDropPct = Number((((curL - prevL) / prevL) * 100).toFixed(1));
        if (Math.abs(winDropPct) >= 0.5 || Math.abs(loseDropPct) >= 0.5) {
          const isSteam = winDropPct <= -3.5 || loseDropPct <= -3.5;
          items.push({
            gameNo: m.gameNo,
            sport: m.sport,
            league: m.league,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            categoryLabel: m.categoryLabel || '일반',
            marketSide: m.foreign?.win ? 'foreign' : 'domestic',
            sourceLabel: m.foreign?.win ? (m.foreignBookmaker || '해외 북메이커') : 'BetMan 국내 배당',
            direction: winDropPct < 0 && loseDropPct > 0 ? 'down' : winDropPct > 0 && loseDropPct < 0 ? 'up' : 'mixed',
            previousOdds: { win: prevW, draw: first.draw ?? first.itemDraw ?? null, lose: prevL },
            currentOdds: { win: curW, draw: last.draw ?? last.itemDraw ?? null, lose: curL },
            winDropPct,
            loseDropPct,
            bookmakerCount: m.foreignBookmakerCount,
            signalTag: isSteam
              ? (winDropPct <= -3.5 ? '홈측 샤프머니 급락 (Steam)' : '원정측 샤프머니 급락 (Steam)')
              : (winDropPct < 0 ? '홈 배당 하향 조정' : '원정 배당 하향 조정'),
            observedAt: m.foreignLastUpdate || new Date().toISOString()
          });
          continue;
        }
      }
    }

    // Also include WiseToto multi-bookmaker live directional consensus (`ico_up` / `ico_down`)
    if (m.oddsSource?.foreign === 'real' && m.foreign && Array.isArray(m.foreignBookmakers) && m.foreignBookmakers.length > 0) {
      const bms = m.foreignBookmakers;
      const winDown = bms.filter((b: any) => b.winMove === 'down').length;
      const winUp = bms.filter((b: any) => b.winMove === 'up').length;
      const loseDown = bms.filter((b: any) => b.loseMove === 'down').length;
      const loseUp = bms.filter((b: any) => b.loseMove === 'up').length;
      const strongMoveCount = Math.max(winDown, winUp, loseDown, loseUp);

      if (strongMoveCount >= Math.max(2, Math.floor(bms.length * 0.4))) {
        const isHomeDropping = winDown >= loseDown && winDown >= winUp;
        const winDropPct = isHomeDropping ? -Number((strongMoveCount * 0.6).toFixed(1)) : Number((winUp * 0.5).toFixed(1));
        const loseDropPct = !isHomeDropping && loseDown > loseUp ? -Number((strongMoveCount * 0.6).toFixed(1)) : Number((loseUp * 0.5).toFixed(1));

        // Compare against recorded snapshot if available
        const fFirst = rec?.foreignTicks?.[0];
        const prevOdds = fFirst
          ? { win: fFirst.win, draw: fFirst.draw, lose: fFirst.lose }
          : { win: m.foreign.win, draw: m.foreign.draw ?? null, lose: m.foreign.lose };

        items.push({
          gameNo: m.gameNo,
          sport: m.sport,
          league: m.league,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          categoryLabel: m.categoryLabel || '일반',
          marketSide: 'foreign',
          sourceLabel: `해외 업체 ${bms.length}곳 동향`,
          direction: isHomeDropping ? 'down' : 'up',
          previousOdds: prevOdds,
          currentOdds: { win: m.foreign.win, draw: m.foreign.draw ?? null, lose: m.foreign.lose },
          winDropPct,
          loseDropPct,
          bookmakerCount: bms.length,
          signalTag: isHomeDropping
            ? `해외 ${winDown}/${bms.length}개사 홈배당 하락`
            : loseDown >= 2
              ? `해외 ${loseDown}/${bms.length}개사 원정배당 하락`
              : `해외 ${bms.length}개사 배당 조정`,
          observedAt: m.foreignLastUpdate || new Date().toISOString()
        });
      }
    }
  }

  return items.sort((a, b) => Math.max(Math.abs(b.winDropPct), Math.abs(b.loseDropPct)) - Math.max(Math.abs(a.winDropPct), Math.abs(a.loseDropPct)));
}
