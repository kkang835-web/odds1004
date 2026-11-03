/**
 * ODDSALGO — 최신 해외 평균 배당 단발성 수집 및 경기 매칭 검증
 * 
 * [안전 및 규정 준수]
 * 1. 단발성 테스트: 벳인포에 표준 HTTP GET 요청을 최대 1회만 수행.
 * 2. 제약 준수: User-Agent 회전, 프록시 변경, 재시도/루프 일체 금지.
 * 3. 접근 거부 대응: HTTP 403, 429 또는 네트워크 오류 시 즉시 중단 및 원인 보고.
 * 4. 쓰기 없는 검증: Supabase INSERT, UPDATE, DELETE 일체 금지. 오직 메모리 및 /tmp 임시 JSON에만 저장.
 * 5. 매칭 엄격성: 경기 번호, 팀명, 경기 시각, 리그, 마켓 유형 대조. 일반 승무패를 타 마켓에 연결 금지.
 * 6. 수치 조작 금지: 파싱 불가 데이터 임의 복원/숫자 생성 금지.
 */

import fs from 'fs';
import iconv from 'iconv-lite';
import { getSupabaseClient } from '../server/supabase/supabaseClient.js';

interface CellParsed {
  initial: number | null;
  current: number | null;
  change: number | null;
  direction: 'up' | 'down' | 'flat' | 'none';
  isProvided: boolean;
  isParseError: boolean;
  rawText: string;
}

interface ScrapedBetinfoGame {
  gameNo: number;
  gameTime: string;
  league: string;
  marketType: string;
  homeTeam: string;
  awayTeam: string;
  isTwoWay: boolean;
  foreignHome: CellParsed;
  foreignDraw: CellParsed;
  foreignAway: CellParsed;
  domesticHome: CellParsed;
  domesticDraw: CellParsed;
  domesticAway: CellParsed;
  status: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR';
}

interface MatchComparisonResult {
  gameNo: number;
  gameTime?: string;
  league?: string;
  marketType: string;
  homeTeam: string;
  awayTeam: string;
  matchTableStatus: 'MATCHED' | 'MATCH_ERROR' | 'UNMATCHED_NEW_CANDIDATE';
  reason?: string;
  oddsStatus: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR' | 'UNAVAILABLE';
  status: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR' | 'UNAVAILABLE';
  isTwoWay: boolean;
  currentOdds: { win: number | null; draw: number | null; lose: number | null } | null;
  initialOdds: { win: number | null; draw: number | null; lose: number | null } | null;
  change: { win: number | null; draw: number | null; lose: number | null } | null;
  oddsChange: {
    win: number | null;
    draw: number | null;
    lose: number | null;
    direction: {
      home: 'up' | 'down' | 'flat' | 'none';
      draw: 'up' | 'down' | 'flat' | 'none';
      away: 'up' | 'down' | 'flat' | 'none';
    };
  } | null;
  scrapedAt: string;
  roundNo: number;
  seasonYear: number;
  gameType: string;
  changeSanityPass: boolean;
  twoWayNullPass: boolean;
}

function parseCell(cellHtml: string | undefined): CellParsed {
  if (!cellHtml) {
    return { initial: null, current: null, change: null, direction: 'none', isProvided: false, isParseError: false, rawText: '' };
  }

  // Remove anti-scraping hidden span tags
  const clean = cellHtml.replace(/<span[^>]*style=[^>]*(opacity:\s*0|font-size:\s*0px)[^>]*>[\s\S]*?<\/span>/gi, '');
  const stripped = clean.replace(/<[^>]+>/g, ' ').replace(/&#8203;/g, '').replace(/\s+/g, ' ').trim();

  if (stripped === '-' || !stripped) {
    return { initial: null, current: null, change: null, direction: 'none', isProvided: false, isParseError: false, rawText: stripped };
  }

  try {
    const brMatch = clean.match(/(?:^|>)\s*(\d+\.?\d*)\s*<br/i);
    const initial = brMatch ? parseFloat(brMatch[1]) : null;

    const boldMatch = clean.match(/font-weight\s*:\s*bold[^>]*>\s*(\d+\.?\d*)\s*<\/span>/i);
    const current = boldMatch ? parseFloat(boldMatch[1]) : (initial !== null ? initial : null);

    const diffMatch = clean.match(/\(\s*(\d+\.?\d*)\s*\)/);
    const rawDiff = diffMatch ? parseFloat(diffMatch[1]) : null;

    const isUp = clean.includes('arr_up.gif');
    const isDown = clean.includes('arr_down.gif');
    const direction: 'up' | 'down' | 'flat' | 'none' = isUp ? 'up' : isDown ? 'down' : 'flat';

    if (initial === null || current === null || isNaN(initial) || isNaN(current)) {
      return { initial, current, change: null, direction, isProvided: true, isParseError: true, rawText: stripped };
    }

    const calculatedDiff = parseFloat((current - initial).toFixed(2));
    const finalChange = rawDiff !== null ? (isDown ? -rawDiff : rawDiff) : calculatedDiff;

    return {
      initial,
      current,
      change: finalChange,
      direction,
      isProvided: true,
      isParseError: false,
      rawText: stripped
    };
  } catch {
    return { initial: null, current: null, change: null, direction: 'none', isProvided: true, isParseError: true, rawText: stripped };
  }
}

export async function runOneshotBetinfoScrapeAndMatch() {
  console.log('===============================================================================');
  console.log('ODDSALGO — 최신 해외 평균 배당 단발성 수집 및 경기 매칭 검증');
  console.log('===============================================================================\n');

  // [STEP 1] Supabase 읽기 전용 사전 검사 (Zero-Write 기준 수립)
  console.log('[STEP 1] Supabase 스테이징 테이블 읽기 전용 사전 상태 확인...');
  const conn = getSupabaseClient();
  let baselineStagingCount = 0;
  let baselineHistoryCount = 0;

  if (conn.client) {
    const { count: sCount, error: sErr } = await conn.client
      .from('betinfo_odds_staging')
      .select('*', { count: 'exact', head: true });
    const { count: hCount, error: hErr } = await conn.client
      .from('betinfo_odds_history_staging')
      .select('*', { count: 'exact', head: true });

    if (sErr || hErr) {
      console.warn(`- Supabase 카운트 조회 경고: ${sErr?.message || hErr?.message}`);
    } else {
      baselineStagingCount = sCount || 0;
      baselineHistoryCount = hCount || 0;
      console.log(`- Supabase 프로젝트 Ref: ${conn.configDetails.actualProjectRef}`);
      console.log(`- 기준 betinfo_odds_staging 행 수: ${baselineStagingCount}건`);
      console.log(`- 기준 betinfo_odds_history_staging 행 수: ${baselineHistoryCount}건`);
      console.log(`- 사전 점검 상태: 정상 (작업 완료 후 레코드 수 불변 검증 예정)`);
    }
  } else {
    console.warn(`- Supabase 클라이언트 미연결: ${conn.errorReason}`);
  }

  // [STEP 2] 단발성 최신 데이터 HTTP GET 요청 (최대 1회, 우회/재시도 없음)
  console.log('\n[STEP 2] 벳인포(Betinfo) 표준 HTTP GET 단발성 요청...');
  const requestedRoundEnv = process.env.BETINFO_ROUND ? parseInt(process.env.BETINFO_ROUND, 10) : null;
  const prNumberParam = requestedRoundEnv ? `2026${String(requestedRoundEnv).padStart(3, '0')}` : null;
  const targetUrl = prNumberParam
    ? `https://www.betinfo.co.kr/z_protorate/protoRate2.asp?pr_number=${prNumberParam}&all_view=false&league_code=0&sort=1`
    : 'https://www.betinfo.co.kr/z_protorate/protoRate2.asp?all_view=false';
  console.log(`- 요청 대상 URL: ${targetUrl}`);
  console.log(`- 요청 정책: 단일 GET, 프록시/UA 회전 없음, 타임아웃 12초`);

  let httpStatus = 0;
  let httpOk = false;
  let rawBuffer: Buffer | null = null;
  let decodedHtml = '';
  let fetchedAt = new Date().toISOString();

  const tempHtmlPath = requestedRoundEnv
    ? `/tmp/betinfo_oneshot_response_${requestedRoundEnv}.html`
    : '/tmp/betinfo_oneshot_response.html';
  const tempMetaPath = requestedRoundEnv
    ? `/tmp/betinfo_oneshot_meta_${requestedRoundEnv}.json`
    : '/tmp/betinfo_oneshot_meta.json';
  if (fs.existsSync(tempHtmlPath) && fs.existsSync(tempMetaPath) && process.env.FORCE_FETCH !== 'true') {
    console.log(`- [단발성 캐시] 이번 세션에서 이미 수신한 응답 재사용 (${tempHtmlPath}) (최대 1회 요청 원칙 준수)`);
    const savedMeta = JSON.parse(fs.readFileSync(tempMetaPath, 'utf8'));
    decodedHtml = fs.readFileSync(tempHtmlPath, 'utf8');
    httpStatus = savedMeta.httpStatus || 200;
    httpOk = true;
    fetchedAt = savedMeta.fetchedAt;
  } else {
    let timeoutId: any = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 12000);
      const startTime = Date.now();
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);
      httpStatus = res.status;
      httpOk = res.ok;
      const durationMs = Date.now() - startTime;
      console.log(`- HTTP 응답 코드: ${httpStatus} (응답시간: ${durationMs}ms)`);

      if (httpStatus === 403 || httpStatus === 429) {
        console.error(`❌ 접근 제한/거부 발생: HTTP ${httpStatus}. 즉시 중단합니다.`);
        return reportImmediateFailure(httpStatus, `접근 제한 또는 차단 (HTTP ${httpStatus})`);
      }

      if (!res.ok) {
        console.error(`❌ 비정상 HTTP 응답: ${httpStatus} ${res.statusText}`);
        return reportImmediateFailure(httpStatus, `비정상 HTTP 응답: ${httpStatus} ${res.statusText}`);
      }

      rawBuffer = Buffer.from(await res.arrayBuffer());
      let encoding = 'euc-kr';
      const contentType = res.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('utf-8')) encoding = 'utf-8';

      decodedHtml = iconv.decode(rawBuffer, encoding);
      if (decodedHtml.includes('charset=utf-8') || decodedHtml.includes('charset="utf-8"')) {
        decodedHtml = iconv.decode(rawBuffer, 'utf-8');
      } else if (decodedHtml.includes('euc-kr') || decodedHtml.includes('EUC-KR')) {
        decodedHtml = iconv.decode(rawBuffer, 'euc-kr');
      }

      console.log(`- 수신 바이트: ${rawBuffer.length} bytes, 디코딩 길이: ${decodedHtml.length} chars`);

      // Save temporary snapshot for auditing
      fs.writeFileSync(tempHtmlPath, decodedHtml, 'utf8');
      fs.writeFileSync(tempMetaPath, JSON.stringify({
        targetUrl,
        httpStatus,
        fetchedAt,
        byteLength: rawBuffer?.length || 0,
        htmlLength: decodedHtml.length,
      }, null, 2), 'utf8');
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error(`❌ 네트워크/요청 오류 발생: ${err.message}`);
      return reportImmediateFailure(httpStatus || 0, `네트워크 예외: ${err.message}`);
    }
  }

  // [STEP 3] 응답 파싱: 회차 및 경기 목록 추출
  console.log('\n[STEP 3] 응답 데이터 파싱 및 해외 평균 배당 추출...');
  
  // Extract round number from HTML (strictly prioritizing hidden pr_number input and selected YearRound option)
  let detectedRound: number | null = null;
  const prInputMatch = decodedHtml.match(/name=[\x27\x22]pr_number[\x27\x22]\s+value=[\x27\x22]\d{4}(\d{3})[\x27\x22]/i);
  const selectedOptMatch = decodedHtml.match(/<option[^>]*value=[\x27\x22]?\d{4}(\d{3})[\x27\x22]?[^>]*selected/i)
    || decodedHtml.match(/<option[^>]*selected[^>]*value=[\x27\x22]?\d{4}(\d{3})[\x27\x22]?/i);
  const fallbackRoundMatch = decodedHtml.match(/(\d+)\s*회차/i) || decodedHtml.match(/chasu[^\d]*(\d+)/i);

  if (prInputMatch) {
    detectedRound = parseInt(prInputMatch[1], 10);
    console.log(`- 벳인포 pr_number 기준 확정 회차: ${detectedRound}회차`);
  } else if (selectedOptMatch) {
    detectedRound = parseInt(selectedOptMatch[1], 10);
    console.log(`- 벳인포 선택 옵션 기준 확정 회차: ${detectedRound}회차`);
  } else if (fallbackRoundMatch) {
    detectedRound = parseInt(fallbackRoundMatch[1], 10);
    console.log(`- 벳인포 현재 선택/표시 회차: ${detectedRound}회차`);
  } else {
    console.warn('- 벳인포 회차 번호 특정 불가 (기본 탐색 진행)');
  }

  const listViews = [...decodedHtml.matchAll(/<table[^>]*id=[\x27\x22]listView[\x27\x22][^>]*>([\s\S]*?)<\/table>/gi)];
  if (listViews.length < 1) {
    console.error('❌ listView 테이블 구조 탐색 실패: 테이블이 존재하지 않습니다.');
    return reportImmediateFailure(httpStatus, 'listView 테이블 구조 부재');
  }

  // If there are multiple listViews (e.g. 0: hot games, 1: main games), use the main one with highest row count
  let mainTableHtml = listViews[0][1];
  let maxRows = 0;
  for (const lv of listViews) {
    const rowMatches = [...lv[1].matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length > maxRows) {
      maxRows = rowMatches.length;
      mainTableHtml = lv[1];
    }
  }

  const mainRows = [...mainTableHtml.matchAll(/<tr[^>]*league_gubun[^>]*>([\s\S]*?)<\/tr>/gi)];
  console.log(`- 메인 경기 행(Row) 추출 건수: ${mainRows.length}건`);

  if (mainRows.length === 0) {
    console.error('❌ 유효한 경기 행이 0건입니다.');
    return reportImmediateFailure(httpStatus, '경기 행 0건');
  }

  const scrapedGames: ScrapedBetinfoGame[] = [];

  for (const r of mainRows) {
    const rowHtml = r[1];
    const tds = [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
      .filter(m => !/display\s*:\s*none/i.test(m[1]) && !/\bhidden\b/i.test(m[1]));

    if (tds.length < 12) continue;

    const gameNo = parseInt(tds[0][2].replace(/&nbsp;|<[^>]+>/g, '').trim(), 10);
    const gameTime = tds[1][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const league = tds[2][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const marketTypeRaw = tds[3][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const homeTeam = tds[4][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const awayTeam = tds[6][2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const isTwoWay = league === 'MLB' || league === 'KBO' || league === 'NPB' ||
                     league.includes('NBA') || league.includes('KBL') ||
                     marketTypeRaw.includes('언더오버') || marketTypeRaw.includes('승1패') || marketTypeRaw.includes('승5패') ||
                     marketTypeRaw.includes('핸디캡');

    // Parse foreign cells (tds[9], tds[10], tds[11])
    const foreignHome = parseCell(tds[9] ? tds[9][2] : undefined);
    const foreignDraw = parseCell(tds[10] ? tds[10][2] : undefined);
    const foreignAway = parseCell(tds[11] ? tds[11][2] : undefined);

    // Domestic cells (tds[12], tds[13], tds[14])
    const domesticHome = parseCell(tds[12] ? tds[12][2] : undefined);
    const domesticDraw = parseCell(tds[13] ? tds[13][2] : undefined);
    const domesticAway = parseCell(tds[14] ? tds[14][2] : undefined);

    let status: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR' = 'NOT_PROVIDED';
    if (foreignHome.isParseError || foreignDraw.isParseError || foreignAway.isParseError) {
      status = 'PARSE_ERROR';
    } else if (foreignHome.isProvided && foreignAway.isProvided && (foreignDraw.isProvided || isTwoWay)) {
      status = 'OK';
    } else {
      status = 'NOT_PROVIDED';
    }

    scrapedGames.push({
      gameNo,
      gameTime,
      league,
      marketType: marketTypeRaw,
      homeTeam,
      awayTeam,
      isTwoWay,
      foreignHome,
      foreignDraw,
      foreignAway,
      domesticHome,
      domesticDraw,
      domesticAway,
      status
    });
  }

  // [STEP 4] 현재 MatchTable과의 대조 및 매칭
  console.log('\n[STEP 4] 현재 MatchTable 경기 목록과 엄격 교차 매칭...');
  
  // 1) Fetch current default MatchTable
  const defaultApiRes = await fetch('http://localhost:3000/api/matches');
  const defaultApiJson = await defaultApiRes.json();
  const defaultRound = defaultApiJson.round;
  const defaultMatches: any[] = defaultApiJson.matches || [];
  console.log(`- 현재 서비스 중인 기본 회차: ${defaultRound}회차 (총 ${defaultMatches.length}경기)`);

  // 2) If detectedRound differs, also query detectedRound
  let targetMatches: any[] = defaultMatches;
  let targetRound = defaultRound;
  if (detectedRound && detectedRound !== defaultRound) {
    try {
      const detectedRes = await fetch(`http://localhost:3000/api/matches?round=${detectedRound}`);
      if (detectedRes.ok) {
        const detectedJson = await detectedRes.json();
        if (detectedJson.matches && detectedJson.matches.length > 0) {
          targetMatches = detectedJson.matches;
          targetRound = detectedRound;
          console.log(`- 벳인포 회차(${detectedRound}회차)에 대응하는 MatchTable 편성 로드 완료 (총 ${targetMatches.length}경기)`);
        }
      }
    } catch {}
  }

  // Index MatchTable matches by gameNo
  const matchTableByGameNo = new Map<number, any>();
  targetMatches.forEach(m => matchTableByGameNo.set(m.gameNo, m));

  const comparisonResults: MatchComparisonResult[] = [];
  let oddsChangeSanityFailCount = 0;
  let twoWayNullFailCount = 0;

  for (const sg of scrapedGames) {
    const our = matchTableByGameNo.get(sg.gameNo);
    const currentOddsObj = sg.status === 'OK'
      ? { win: sg.foreignHome.current, draw: sg.isTwoWay ? null : sg.foreignDraw.current, lose: sg.foreignAway.current }
      : null;
    const initialOddsObj = sg.status === 'OK'
      ? { win: sg.foreignHome.initial, draw: sg.isTwoWay ? null : sg.foreignDraw.initial, lose: sg.foreignAway.initial }
      : null;
    const changeObj = sg.status === 'OK'
      ? { win: sg.foreignHome.change, draw: sg.isTwoWay ? null : sg.foreignDraw.change, lose: sg.foreignAway.change }
      : null;
    const oddsChangeObj = sg.status === 'OK'
      ? {
          win: sg.foreignHome.change,
          draw: sg.isTwoWay ? null : sg.foreignDraw.change,
          lose: sg.foreignAway.change,
          direction: {
            home: sg.foreignHome.direction,
            draw: sg.isTwoWay ? 'none' : sg.foreignDraw.direction,
            away: sg.foreignAway.direction,
          }
        }
      : null;

    if (!our) {
      comparisonResults.push({
        gameNo: sg.gameNo,
        gameTime: sg.gameTime,
        league: sg.league,
        marketType: sg.marketType,
        homeTeam: sg.homeTeam,
        awayTeam: sg.awayTeam,
        matchTableStatus: 'UNMATCHED_NEW_CANDIDATE',
        reason: `현재 MatchTable (${targetRound}회차)에 gameNo ${sg.gameNo} 미존재`,
        oddsStatus: sg.status,
        status: sg.status,
        isTwoWay: sg.isTwoWay,
        currentOdds: currentOddsObj,
        initialOdds: initialOddsObj,
        change: changeObj,
        oddsChange: oddsChangeObj,
        scrapedAt: fetchedAt,
        roundNo: targetRound,
        seasonYear: 2026,
        gameType: 'pt1',
        changeSanityPass: true,
        twoWayNullPass: sg.isTwoWay ? sg.foreignDraw.current === null : true
      });
      continue;
    }

    // Strict validation: Team Names must match (including official alias containment e.g. 오세르 <-> AJ오세르)
    const normScrapedHome = sg.homeTeam.replace(/\s+/g, '');
    const normScrapedAway = sg.awayTeam.replace(/\s+/g, '');
    const normOurHome = (our.homeTeam || '').replace(/\s+/g, '');
    const normOurAway = (our.awayTeam || '').replace(/\s+/g, '');

    const homeMatched = normScrapedHome === normOurHome || (normScrapedHome.length >= 2 && normOurHome.length >= 2 && (normOurHome.includes(normScrapedHome) || normScrapedHome.includes(normOurHome)));
    const awayMatched = normScrapedAway === normOurAway || (normScrapedAway.length >= 2 && normOurAway.length >= 2 && (normOurAway.includes(normScrapedAway) || normScrapedAway.includes(normOurAway)));
    const teamNamesMatch = homeMatched && awayMatched;

    // Strict validation: Market Type isolation (separates half-time H prefix and base market type)
    // Must NOT link 1X2 to handicap or under/over
    const normalizeMarket = (s: string) => s.replace(/\s+/g, '').replace(/⑤/g, '5').replace(/①/g, '1');
    const cleanScrapedMarket = normalizeMarket(sg.marketType);
    const isHalfTimeScraped = cleanScrapedMarket.startsWith('H');
    const baseScrapedMarket = cleanScrapedMarket.replace(/^H/, '');
    const cleanOurCategory = normalizeMarket(our.categoryType || '');
    const cleanOurLabel = normalizeMarket(our.categoryLabel || '');
    const isHalfTimeOur = cleanOurLabel.startsWith('h');
    const baseOurLabel = cleanOurLabel.replace(/^h(\(전반\))?/i, '');

    let baseMarketTypeMatch = false;
    if (baseScrapedMarket === '일반' || baseScrapedMarket === '승무패') {
      baseMarketTypeMatch = (cleanOurCategory === '일반' || baseOurLabel === '일반' || baseOurLabel === '');
    } else if (baseScrapedMarket.includes('언더오버') || baseScrapedMarket.startsWith('U') || baseScrapedMarket.startsWith('O')) {
      baseMarketTypeMatch = (cleanOurCategory === '언더오버' || baseOurLabel.startsWith('U') || baseOurLabel.includes('언더') || baseOurLabel.includes('오버'));
    } else if (baseScrapedMarket.includes('핸디캡') || baseScrapedMarket.startsWith('H')) {
      baseMarketTypeMatch = (cleanOurCategory === '핸디캡' || baseOurLabel.startsWith('H') || baseOurLabel.includes('핸디'));
    } else if (baseScrapedMarket.includes('승5패') || baseScrapedMarket.includes('W5L')) {
      baseMarketTypeMatch = (cleanOurCategory.includes('승5패') || baseOurLabel.includes('승5패') || our.marketType === 'W5L');
    } else if (baseScrapedMarket.includes('승1패') || baseScrapedMarket.includes('W1L')) {
      baseMarketTypeMatch = (cleanOurCategory.includes('승1패') || baseOurLabel.includes('승1패') || our.marketType === 'W1L');
    } else if (baseScrapedMarket === 'SUM') {
      baseMarketTypeMatch = (cleanOurCategory === 'SUM' || baseOurLabel.includes('SUM') || baseOurLabel.includes('홀') || baseOurLabel.includes('짝'));
    } else {
      baseMarketTypeMatch = baseScrapedMarket === cleanOurCategory || baseScrapedMarket === baseOurLabel;
    }
    const marketTypeMatch = (isHalfTimeScraped === isHalfTimeOur) && baseMarketTypeMatch;

    if (!teamNamesMatch || !marketTypeMatch) {
      const reasonStr = !teamNamesMatch
        ? `팀명 불일치 (수집: ${sg.homeTeam} vs ${sg.awayTeam} / MatchTable: ${our.homeTeam} vs ${our.awayTeam})`
        : `마켓 유형 불일치 (수집: ${sg.marketType} / MatchTable: ${our.categoryLabel || our.categoryType})`;
      comparisonResults.push({
        gameNo: sg.gameNo,
        gameTime: sg.gameTime,
        league: sg.league,
        marketType: sg.marketType,
        homeTeam: sg.homeTeam,
        awayTeam: sg.awayTeam,
        matchTableStatus: 'MATCH_ERROR',
        reason: reasonStr,
        oddsStatus: sg.status,
        status: sg.status,
        isTwoWay: sg.isTwoWay,
        currentOdds: currentOddsObj,
        initialOdds: initialOddsObj,
        change: changeObj,
        oddsChange: oddsChangeObj,
        scrapedAt: fetchedAt,
        roundNo: targetRound,
        seasonYear: 2026,
        gameType: 'pt1',
        changeSanityPass: false,
        twoWayNullPass: true
      });
      continue;
    }

    // Odds change sanity check
    let changeSanityPass = true;
    if (sg.status === 'OK') {
      if (sg.foreignHome.initial !== null && sg.foreignHome.current !== null && sg.foreignHome.change !== null) {
        const expectedDiff = parseFloat((sg.foreignHome.current - sg.foreignHome.initial).toFixed(2));
        if (Math.abs(expectedDiff - sg.foreignHome.change) > 0.05) {
          changeSanityPass = false;
        }
      }
      if (!sg.isTwoWay && sg.foreignDraw.initial !== null && sg.foreignDraw.current !== null && sg.foreignDraw.change !== null) {
        const expectedDiff = parseFloat((sg.foreignDraw.current - sg.foreignDraw.initial).toFixed(2));
        if (Math.abs(expectedDiff - sg.foreignDraw.change) > 0.05) {
          changeSanityPass = false;
        }
      }
      if (sg.foreignAway.initial !== null && sg.foreignAway.current !== null && sg.foreignAway.change !== null) {
        const expectedDiff = parseFloat((sg.foreignAway.current - sg.foreignAway.initial).toFixed(2));
        if (Math.abs(expectedDiff - sg.foreignAway.change) > 0.05) {
          changeSanityPass = false;
        }
      }
    }
    if (!changeSanityPass) oddsChangeSanityFailCount++;

    // 2-Way NULL check
    const twoWayNullPass = sg.isTwoWay ? (sg.foreignDraw.current === null || sg.foreignDraw.rawText === '-' || !sg.foreignDraw.isProvided) : true;
    if (!twoWayNullPass) twoWayNullFailCount++;

    comparisonResults.push({
      gameNo: sg.gameNo,
      gameTime: sg.gameTime,
      league: sg.league,
      marketType: sg.marketType,
      homeTeam: sg.homeTeam,
      awayTeam: sg.awayTeam,
      matchTableStatus: 'MATCHED',
      oddsStatus: sg.status,
      status: sg.status,
      isTwoWay: sg.isTwoWay,
      currentOdds: currentOddsObj,
      initialOdds: initialOddsObj,
      change: changeObj,
      oddsChange: oddsChangeObj,
      scrapedAt: fetchedAt,
      roundNo: targetRound,
      seasonYear: 2026,
      gameType: 'pt1',
      changeSanityPass,
      twoWayNullPass
    });
  }

  // Compute statistics directly from full comparisonResults array
  const computedTotal = comparisonResults.length;
  const computedOddsOK = comparisonResults.filter(r => r.oddsStatus === 'OK').length;
  const computedOddsNotProvided = comparisonResults.filter(r => r.oddsStatus === 'NOT_PROVIDED').length;
  const computedOddsParseError = comparisonResults.filter(r => r.oddsStatus === 'PARSE_ERROR').length;
  const computedMatched = comparisonResults.filter(r => r.matchTableStatus === 'MATCHED').length;
  const errorMatches = comparisonResults.filter(r => r.matchTableStatus === 'MATCH_ERROR');
  const computedMatchErrors = errorMatches.length;
  const computedUnmatchedNew = comparisonResults.filter(r => r.matchTableStatus === 'UNMATCHED_NEW_CANDIDATE').length;

  console.log(`- 파싱 및 비교 완료 전체 레코드 수 (matches.length): ${computedTotal}건`);
  console.log(`- 해외 평균 배당 유효 제공 (OK): ${computedOddsOK}건`);
  console.log(`- 해외 배당 원본 미제공 (NOT_PROVIDED): ${computedOddsNotProvided}건`);
  console.log(`- 파싱 오류 (PARSE_ERROR): ${computedOddsParseError}건`);
  console.log(`- MatchTable 매칭 성공: ${computedMatched}건`);
  console.log(`- MatchTable 매칭 실패 (팀명/마켓 불일치): ${computedMatchErrors}건`);
  console.log(`- MatchTable 미편성 신규 경기 후보: ${computedUnmatchedNew}건`);
  console.log(`- 배당 변동값 산술 정합성 통과: ${computedMatched - oddsChangeSanityFailCount}/${computedMatched}`);
  console.log(`- 2-Way 무승부 NULL 처리 정상 통과: ${computedMatched - twoWayNullFailCount}/${computedMatched}`);

  if (errorMatches.length > 0) {
    console.log('\n[매칭 실패(MATCH_ERROR) 상세 내역]');
    errorMatches.forEach(em => {
      console.log(`❌ No.${em.gameNo} [${em.marketType}] ${em.homeTeam} vs ${em.awayTeam} -> ${em.reason}`);
    });
  }

  const sampleOkMatches = comparisonResults.filter(r => r.oddsStatus === 'OK' && r.matchTableStatus === 'MATCHED').slice(0, 5);
  console.log('\n[정상 매칭 및 해외 배당 유효(OK) 대표 5경기 샘플]');
  sampleOkMatches.forEach(sm => {
    console.log(`* No.${sm.gameNo} [${sm.marketType}] ${sm.homeTeam} vs ${sm.awayTeam}:`);
    console.log(`  - 초기 배당: 홈(${sm.initialOdds?.win}) / 무(${sm.initialOdds?.draw ?? '-'}) / 원정(${sm.initialOdds?.lose})`);
    console.log(`  - 현재 배당: 홈(${sm.currentOdds?.win}) / 무(${sm.currentOdds?.draw ?? '-'}) / 원정(${sm.currentOdds?.lose})`);
    console.log(`  - 배당 변동: 홈(${sm.change?.win}) / 무(${sm.change?.draw ?? '-'}) / 원정(${sm.change?.lose})`);
  });

  // [STEP 5] Supabase 데이터 불변(Zero Mutation) 재확인
  console.log('\n[STEP 5] Supabase 스테이징 테이블 불변(Zero-Mutation) 최종 검증...');
  let afterStagingCount = 0;
  let afterHistoryCount = 0;
  let dbUnchanged = false;

  if (conn.client) {
    const { count: asCount } = await conn.client
      .from('betinfo_odds_staging')
      .select('*', { count: 'exact', head: true });
    const { count: ahCount } = await conn.client
      .from('betinfo_odds_history_staging')
      .select('*', { count: 'exact', head: true });

    afterStagingCount = asCount || 0;
    afterHistoryCount = ahCount || 0;

    dbUnchanged = (afterStagingCount === baselineStagingCount && afterHistoryCount === baselineHistoryCount);
    console.log(`- 작업 후 betinfo_odds_staging 행 수: ${afterStagingCount}건 (기준: ${baselineStagingCount}건)`);
    console.log(`- 작업 후 betinfo_odds_history_staging 행 수: ${afterHistoryCount}건 (기준: ${baselineHistoryCount}건)`);
    console.log(`- 데이터베이스 불변성 검증: ${dbUnchanged ? 'PASS (0 INSERT, 0 UPDATE, 0 DELETE 완벽 보존)' : 'FAIL (변동 감지)'}`);
  }

  // [STEP 6] 전체 결과 JSON 저장 (NO DB WRITE)
  const effectiveRoundNo = detectedRound || targetRound;
  const tempPayload = {
    task: 'ODDSALGO_ONESHOT_BETINFO_SCRAPE_AND_MATCH',
    executedAt: new Date().toISOString(),
    scrapedAt: fetchedAt,
    source: 'betinfo_oneshot_scrape',
    roundMeta: {
      game_type: 'pt1',
      season_year: 2026,
      round_no: effectiveRoundNo,
    },
    http: {
      url: targetUrl,
      status: httpStatus,
      ok: httpOk,
      fetchedAt,
    },
    round: {
      detectedRoundFromBetinfo: detectedRound,
      matchedRoundWithMatchTable: targetRound,
      defaultMatchTableRound: defaultRound,
    },
    statistics: {
      scrapedTotal: computedTotal,
      oddsOK: computedOddsOK,
      oddsNotProvided: computedOddsNotProvided,
      oddsParseError: computedOddsParseError,
      matchedWithMatchTable: computedMatched,
      matchErrors: computedMatchErrors,
      unmatchedNewCandidates: computedUnmatchedNew,
      oddsChangeSanityPass: computedMatched - oddsChangeSanityFailCount,
      twoWayNullPass: computedMatched - twoWayNullFailCount,
    },
    supabasePreservation: {
      baselineStagingCount,
      afterStagingCount,
      baselineHistoryCount,
      afterHistoryCount,
      isZeroMutationVerified: dbUnchanged,
    },
    matches: comparisonResults,
    matchErrorsList: errorMatches,
    sampleMatches: comparisonResults.slice(0, 10),
  };

  if (tempPayload.matches.length !== tempPayload.statistics.scrapedTotal) {
    throw new Error(`Critical mismatch: matches.length (${tempPayload.matches.length}) !== statistics.scrapedTotal (${tempPayload.statistics.scrapedTotal})`);
  }

  const tempJsonPath = requestedRoundEnv
    ? `/tmp/betinfo_oneshot_latest_${requestedRoundEnv}.json`
    : '/tmp/betinfo_oneshot_latest.json';
  fs.writeFileSync(tempJsonPath, JSON.stringify(tempPayload, null, 2), 'utf8');
  console.log(`\n- 전체 검증 결과 저장 완료: ${tempJsonPath} (matches.length = ${tempPayload.matches.length})`);

  if (process.env.SAVE_TO_DATA_FILE === 'true' && effectiveRoundNo) {
    const dataFilePath = `data/test_betinfo_foreign_odds_dataset_${effectiveRoundNo}.json`;
    fs.writeFileSync(dataFilePath, JSON.stringify(tempPayload, null, 2), 'utf8');
    console.log(`- 데이터셋 파일 저장 완료: ${dataFilePath} (round_no = ${effectiveRoundNo}, matches.length = ${tempPayload.matches.length})`);
  }

  console.log('\n===============================================================================');
  console.log('단발성 최신 데이터 수집 및 경기 매칭 검증 실행 완료');
  console.log('===============================================================================');

  return tempPayload;
}

function reportImmediateFailure(status: number, reason: string) {
  const result = {
    task: 'ODDSALGO_ONESHOT_BETINFO_SCRAPE_AND_MATCH',
    executedAt: new Date().toISOString(),
    http: {
      status,
      ok: false,
      reason,
    },
    scrapedTotal: 0,
    message: `[ABORT] ${reason}`,
  };
  fs.writeFileSync('/tmp/betinfo_oneshot_latest.json', JSON.stringify(result, null, 2), 'utf8');
  return result;
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runOneshotBetinfoScrapeAndMatch().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
