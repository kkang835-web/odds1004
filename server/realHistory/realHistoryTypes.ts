export type RealSportType = "sc1" | "bs1" | "bk1";
export type RealMatchOutcome = "win" | "draw" | "lose" | "canceled" | null;
export type RealIntegrityStatus = "VALID" | "MISMATCH" | "DUPLICATE" | "UNAVAILABLE";

export interface RealVoteRate {
  win: number | null;
  draw: number | null;
  lose: number | null;
  winCount?: number;
  drawCount?: number;
  loseCount?: number;
  totalCount?: number;
}

export interface RealHistoricalMatch {
  matchId: string; // sport_year_round_matchNo
  year: number;
  round: number;
  sport: RealSportType;
  matchNo: number;
  matchDate: string;
  league: string;

  homeTeam: string;
  awayTeam: string;
  rawHomeTeam?: string;
  rawAwayTeam?: string;

  voteRate: RealVoteRate;

  homeScore: number | null;
  awayScore: number | null;
  outcomeTag: string | null;
  outcome: RealMatchOutcome;

  masterSeq: string | number | null;

  marketSource: string; // toto_calc URL
  resultSource: string | null; // get_toto_list URL

  dataSource: "real" | "unavailable";
  isSimulated: false;

  integrityStatus: RealIntegrityStatus;
  validationNotes?: string[];
}

export interface RealHistoricalRound {
  sport: RealSportType;
  year: number;
  round: number;
  masterSeq: string | number | null;
  marketFetchStatus: number;
  resultFetchStatus: number;
  matchCount: number;
  validCount: number;
  unavailableCount: number;
  mismatchCount: number;
  duplicateCount: number;
  syntheticCount: 0;
  matches: RealHistoricalMatch[];
  collectedAt: string;
}

export interface MasterSeqCacheEntry {
  sport: RealSportType;
  year: number;
  round: number;
  masterSeq: number;
  sampleHomeTeam: string;
  sampleAwayTeam: string;
  verifiedAt: string;
}
