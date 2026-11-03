/**
 * ODDSALGO — Supabase 벳인포 해외 평균 배당 테스트 테이블 연동 서비스 (회차별 파티셔닝 지원)
 * 
 * [원칙 및 제약사항]
 * 1. 개발/테스트 격리: 별도 스테이징 테이블(betinfo_odds_staging, betinfo_odds_history_staging)만 접근.
 * 2. 회차 명시 필수: game_type, season_year, round_no 누락 시 자동 보정 없이 즉시 에러 발생.
 * 3. 멱등성 보장: (game_type, season_year, round_no, game_no, market_type) 복합 고유키 기준.
 * 4. 배당 무결성: 2-way 마켓 무승부는 null 처리, 초기 배당은 갱신 시 보존.
 */

export interface RoundMetadata {
  game_type: string;
  season_year: number;
  round_no: number;
}

export interface BetinfoOddsStagingRecord extends RoundMetadata {
  id?: number;
  game_no: number;
  market_type: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  initial_home: number | null;
  initial_draw: number | null;
  initial_away: number | null;
  current_home: number | null;
  current_draw: number | null;
  current_away: number | null;
  change_home: number | null;
  change_draw: number | null;
  change_away: number | null;
  status: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR';
  scraped_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface BetinfoHistoryStagingRecord extends Omit<BetinfoOddsStagingRecord, 'updated_at'> {
  recorded_at?: string;
}

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  hasServiceRoleKey: boolean;
  isTestEnvironment: boolean;
  errorReason?: string;
}

/**
 * Supabase 환경 변수 및 테스트 프로젝트 연결 안전 검증
 */
export function checkSupabaseEnvironment(): SupabaseConfigStatus {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  const hasUrl = Boolean(url && url.trim().length > 0);
  const hasKey = Boolean(anonKey && anonKey.trim().length > 0);
  const hasServiceRoleKey = Boolean(serviceKey && serviceKey.trim().length > 0);

  const isTestEnvironment = nodeEnv !== 'production' || url.includes('test') || url.includes('staging') || url.includes('dev');

  if (!hasUrl || (!hasKey && !hasServiceRoleKey)) {
    return {
      isConfigured: false,
      hasUrl,
      hasKey,
      hasServiceRoleKey,
      isTestEnvironment,
      errorReason: 'SUPABASE_CONFIG_MISSING: SUPABASE_URL 및 SUPABASE_ANON_KEY 환경 변수가 설정되지 않았습니다.'
    };
  }

  if (!isTestEnvironment) {
    return {
      isConfigured: false,
      hasUrl,
      hasKey,
      hasServiceRoleKey,
      isTestEnvironment: false,
      errorReason: 'PRODUCTION_WRITE_PROHIBITED: 운영 환경이 감지되어 테스트 테이블 쓰기 작업이 안전 가드에 의해 차단되었습니다.'
    };
  }

  return {
    isConfigured: true,
    hasUrl,
    hasKey,
    hasServiceRoleKey,
    isTestEnvironment: true
  };
}

/**
 * 원본 검증 데이터셋 아이템을 회차 정보가 포함된 스테이징 테이블 레코드 형식으로 변환
 * 회차 정보가 누락된 경우 자동 보정하지 않고 즉시 에러 발생
 */
export function transformToStagingRecord(
  item: any,
  roundMeta: RoundMetadata,
  kickoffAtMap?: Map<number, string>
): BetinfoOddsStagingRecord {
  if (!roundMeta || !roundMeta.game_type || !roundMeta.season_year || !roundMeta.round_no) {
    throw new Error('STAGING_TRANSFORM_ERROR: game_type, season_year, round_no 회차 정보가 명시되지 않았습니다. 누락된 채로 적재할 수 없습니다.');
  }

  const isTwoWay = Boolean(
    item.marketVerification?.isTwoWay ||
    item.marketType === '언더오버' ||
    item.marketType === '승1패' ||
    item.marketType === '승5패' ||
    item.marketType === 'H언더오버' ||
    item.league === 'MLB' ||
    item.league === 'KBO' ||
    item.league === 'NPB'
  );

  const status: 'OK' | 'NOT_PROVIDED' | 'PARSE_ERROR' = 
    item.status === 'OK' ? 'OK' : 
    item.status === 'PARSE_ERROR' ? 'PARSE_ERROR' : 'NOT_PROVIDED';

  const kickoffAt = kickoffAtMap?.get(Number(item.gameNo)) || null;

  return {
    game_type: String(roundMeta.game_type).trim(),
    season_year: Number(roundMeta.season_year),
    round_no: Number(roundMeta.round_no),
    game_no: Number(item.gameNo),
    market_type: String(item.marketType || '일반').trim(),
    home_team: String(item.homeTeam || '').trim(),
    away_team: String(item.awayTeam || '').trim(),
    kickoff_at: kickoffAt,
    initial_home: item.initialOdds?.win ?? null,
    initial_draw: isTwoWay ? null : (item.initialOdds?.draw ?? null),
    initial_away: item.initialOdds?.lose ?? null,
    current_home: item.currentOdds?.win ?? null,
    current_draw: isTwoWay ? null : (item.currentOdds?.draw ?? null),
    current_away: item.currentOdds?.lose ?? null,
    change_home: item.oddsChange?.win ?? null,
    change_draw: isTwoWay ? null : (item.oddsChange?.draw ?? null),
    change_away: item.oddsChange?.lose ?? null,
    status,
    scraped_at: item.scrapedAt || new Date().toISOString()
  };
}

/**
 * 회차별 파티셔닝이 적용된 인메모리 SQL 스테이징 시뮬레이터
 * 복합 고유키: (game_type, season_year, round_no, game_no, market_type)
 */
export class BetinfoStagingSqlSimulator {
  private latestStore = new Map<string, BetinfoOddsStagingRecord>();
  private historyStore = new Map<string, BetinfoHistoryStagingRecord>();

  private getLatestKey(r: RoundMetadata, gameNo: number, marketType: string): string {
    return `${r.game_type}__${r.season_year}__${r.round_no}__${gameNo}__${marketType}`;
  }

  private getHistoryKey(r: RoundMetadata, gameNo: number, marketType: string, scrapedAt: string): string {
    return `${r.game_type}__${r.season_year}__${r.round_no}__${gameNo}__${marketType}__${scrapedAt}`;
  }

  /**
   * 최신 배당 테이블에 Upsert (ON CONFLICT (game_type, season_year, round_no, game_no, market_type) DO UPDATE)
   */
  public upsertLatest(record: BetinfoOddsStagingRecord): { action: 'INSERT' | 'UPDATE'; record: BetinfoOddsStagingRecord } {
    if (!record.game_type || !record.season_year || !record.round_no) {
      throw new Error('UPSERT_LATEST_ERROR: 회차 정보(game_type, season_year, round_no)가 누락되었습니다.');
    }

    const key = this.getLatestKey(record, record.game_no, record.market_type);
    const existing = this.latestStore.get(key);
    const now = new Date().toISOString();

    if (!existing) {
      const inserted: BetinfoOddsStagingRecord = {
        ...record,
        id: this.latestStore.size + 1,
        created_at: now,
        updated_at: now
      };
      this.latestStore.set(key, inserted);
      return { action: 'INSERT', record: inserted };
    } else {
      const updated: BetinfoOddsStagingRecord = {
        ...existing,
        home_team: record.home_team,
        away_team: record.away_team,
        kickoff_at: record.kickoff_at || existing.kickoff_at,
        current_home: record.current_home,
        current_draw: record.current_draw,
        current_away: record.current_away,
        change_home: record.change_home,
        change_draw: record.change_draw,
        change_away: record.change_away,
        status: record.status,
        scraped_at: record.scraped_at,
        updated_at: now
      };
      this.latestStore.set(key, updated);
      return { action: 'UPDATE', record: updated };
    }
  }

  /**
   * 이력 테이블에 멱등성 Insert (ON CONFLICT (...) DO NOTHING)
   */
  public insertHistory(record: BetinfoOddsStagingRecord): { inserted: boolean; record?: BetinfoHistoryStagingRecord } {
    if (!record.game_type || !record.season_year || !record.round_no) {
      throw new Error('INSERT_HISTORY_ERROR: 회차 정보(game_type, season_year, round_no)가 누락되었습니다.');
    }

    const key = this.getHistoryKey(record, record.game_no, record.market_type, record.scraped_at);
    if (this.historyStore.has(key)) {
      return { inserted: false };
    }

    const historyRecord: BetinfoHistoryStagingRecord = {
      ...record,
      id: this.historyStore.size + 1,
      recorded_at: new Date().toISOString()
    };
    this.historyStore.set(key, historyRecord);
    return { inserted: true, record: historyRecord };
  }

  public getLatestCount(): number {
    return this.latestStore.size;
  }

  public getHistoryCount(): number {
    return this.historyStore.size;
  }

  public getLatestRecord(meta: RoundMetadata, gameNo: number, marketType: string): BetinfoOddsStagingRecord | undefined {
    return this.latestStore.get(this.getLatestKey(meta, gameNo, marketType));
  }

  public getHistoryRecords(meta: RoundMetadata, gameNo: number, marketType: string): BetinfoHistoryStagingRecord[] {
    const res: BetinfoHistoryStagingRecord[] = [];
    const prefix = `${meta.game_type}__${meta.season_year}__${meta.round_no}__${gameNo}__${marketType}__`;
    for (const [k, v] of this.historyStore.entries()) {
      if (k.startsWith(prefix)) {
        res.push(v);
      }
    }
    return res;
  }

  public getStatusCounts(meta?: RoundMetadata): { OK: number; NOT_PROVIDED: number; PARSE_ERROR: number } {
    let ok = 0;
    let np = 0;
    let pe = 0;
    for (const r of this.latestStore.values()) {
      if (meta && (r.game_type !== meta.game_type || r.season_year !== meta.season_year || r.round_no !== meta.round_no)) {
        continue;
      }
      if (r.status === 'OK') ok++;
      else if (r.status === 'NOT_PROVIDED') np++;
      else if (r.status === 'PARSE_ERROR') pe++;
    }
    return { OK: ok, NOT_PROVIDED: np, PARSE_ERROR: pe };
  }

  public rollbackRecord(meta: RoundMetadata, gameNo: number, marketType: string, snapshot: BetinfoOddsStagingRecord, newScrapedAt?: string) {
    const latestKey = this.getLatestKey(meta, gameNo, marketType);
    this.latestStore.set(latestKey, { ...snapshot });
    if (newScrapedAt) {
      const historyKey = this.getHistoryKey(meta, gameNo, marketType, newScrapedAt);
      this.historyStore.delete(historyKey);
    }
  }

  public clearAll() {
    this.latestStore.clear();
    this.historyStore.clear();
  }
}
