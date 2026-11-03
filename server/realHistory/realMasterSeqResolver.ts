import https from "https";
import iconv from "iconv-lite";
import { RealSportType, MasterSeqCacheEntry } from "./realHistoryTypes.js";
import { normalizeTeamName, validateMatchIntegrity } from "./realIntegrityValidator.js";
import { parseTotoListResults } from "./realResultMapper.js";

export interface MasterSeqValidationResult {
  sport: RealSportType;
  year: number;
  round: number;
  masterSeq: number | null;
  candidatesTested: number;
  sampleMatchCount: number;
  fullMatchCount: number;
  status: "VALID" | "UNRESOLVED";
}

// In-memory verified cache (Only stores 14/14 validated masterSeqs)
const verifiedMasterSeqCache = new Map<string, MasterSeqCacheEntry>();

function fetchEucKrBuffer(url: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; len: number }> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...headers
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode || 500,
          text: iconv.decode(buf, "euc-kr"),
          len: buf.length
        });
      });
    }).on("error", () => resolve({ status: 500, text: "", len: 0 }));
  });
}

/**
 * Validates whether a candidate masterSeq produces a 14/14 match against the market matches
 */
export async function testCandidateMasterSeq(
  sport: RealSportType,
  year: number,
  round: number,
  candidateSeq: number,
  marketMatches: Array<{
    matchNo: number;
    date: string;
    homeTeam: string;
    awayTeam: string;
  }>,
  ajaxHeaders: Record<string, string>
): Promise<{ sampleMatches: number; fullMatches: number; isValid14: boolean; results: any[] }> {
  if (!marketMatches || marketMatches.length < 14) {
    return { sampleMatches: 0, fullMatches: 0, isValid14: false, results: [] };
  }

  const url = `https://www.wisetoto.com/util/gameinfo/get_toto_list.htm?game_category=${sport}&game_info_master_seq=${candidateSeq}&tab_type=toto`;
  const res = await fetchEucKrBuffer(url, ajaxHeaders);

  if (res.status !== 200 || res.len < 1000) {
    return { sampleMatches: 0, fullMatches: 0, isValid14: false, results: [] };
  }

  const parsedResults = parseTotoListResults(res.text);
  if (parsedResults.length < 14) {
    return { sampleMatches: 0, fullMatches: 0, isValid14: false, results: [] };
  }

  // Tier 1: Check sample top 3 matches (matchNo, homeTeam, awayTeam)
  let sampleMatchCount = 0;
  for (let i = 0; i < 3; i++) {
    const mM = marketMatches[i];
    const rM = parsedResults.find(r => r.matchNo === mM.matchNo);
    if (rM) {
      const normMH = normalizeTeamName(mM.homeTeam);
      const normMA = normalizeTeamName(mM.awayTeam);
      const normRH = normalizeTeamName(rM.homeTeam);
      const normRA = normalizeTeamName(rM.awayTeam);

      const hMatch = normMH === normRH || (normMH.length >= 2 && normRH.includes(normMH)) || (normRH.length >= 2 && normMH.includes(normRH));
      const aMatch = normMA === normRA || (normMA.length >= 2 && normRA.includes(normMA)) || (normRA.length >= 2 && normMA.includes(normRA));

      if (hMatch && aMatch) {
        sampleMatchCount++;
      }
    }
  }

  if (sampleMatchCount < 3) {
    return { sampleMatches: sampleMatchCount, fullMatches: 0, isValid14: false, results: [] };
  }

  // Tier 2: Full 14-match integrity check
  const seenKeys = new Set<string>();
  let fullMatchCount = 0;

  for (const mM of marketMatches) {
    const rM = parsedResults.find(r => r.matchNo === mM.matchNo) || null;
    const { status } = validateMatchIntegrity({
      sport,
      year,
      round,
      matchNo: mM.matchNo,
      matchDate: mM.date,
      homeTeam: mM.homeTeam,
      awayTeam: mM.awayTeam
    }, rM, seenKeys);

    if (status === "VALID") {
      fullMatchCount++;
    }
  }

  const isValid14 = fullMatchCount === 14;
  return { sampleMatches: sampleMatchCount, fullMatches: fullMatchCount, isValid14, results: parsedResults };
}

/**
 * Resolves masterSeq for a given sport, year, and round using 2-Tier Candidate Verification.
 * Fast path: Extracts candidate from index.htm, verifies 14/14.
 * Fallback path: Scans candidate windows, strictly verifying 14/14 before caching.
 */
export async function resolveMasterSeq(
  sport: RealSportType,
  year: number,
  round: number,
  marketMatches: Array<{
    matchNo: number;
    date: string;
    homeTeam: string;
    awayTeam: string;
  }>,
  ajaxHeaders: Record<string, string> = {}
): Promise<{ masterSeq: number | null; source: "cache" | "resolved" | "failed"; validationDetails?: MasterSeqValidationResult }> {
  const cacheKey = `${sport}:${year}:${round}`;

  // 1. Check verified cache
  if (verifiedMasterSeqCache.has(cacheKey)) {
    const entry = verifiedMasterSeqCache.get(cacheKey)!;
    return {
      masterSeq: entry.masterSeq,
      source: "cache",
      validationDetails: {
        sport,
        year,
        round,
        masterSeq: entry.masterSeq,
        candidatesTested: 0,
        sampleMatchCount: 3,
        fullMatchCount: 14,
        status: "VALID"
      }
    };
  }

  if (!marketMatches || marketMatches.length < 14) {
    return { masterSeq: null, source: "failed" };
  }

  let candidatesTested = 0;

  // 2. Primary Fast Path: Try extracting candidate masterSeq from index.htm
  const sportKey = sport === "sc1" ? "soccer" : (sport === "bs1" ? "baseball" : "basketball");
  const indexUrl = `https://www.wisetoto.com/index.htm?tab_type=toto&game_type=${sportKey}&game_category=${sport}&game_year=${year}&game_round=${round}`;
  const rIndex = await fetchEucKrBuffer(indexUrl);

  if (rIndex.status === 200 && rIndex.len > 1000) {
    const seqMatch = rIndex.text.match(/get_gameinfo_body\s*\(\s*[\x27"]toto[\x27"]\s*,\s*[\x27"][^\x27"]+[\x27"]\s*,\s*[\x27"]\d+[\x27"]\s*,\s*[\x27"]\d+[\x27"]\s*,\s*[\x27"]?[\w]*[\x27"]?\s*,\s*[\x27"]?[\w]*[\x27"]?\s*,\s*[\x27"](\d+)[\x27"]/i);
    if (seqMatch && seqMatch[1]) {
      const candidate = parseInt(seqMatch[1], 10);
      if (!isNaN(candidate)) {
        candidatesTested++;
        const { sampleMatches, fullMatches, isValid14 } = await testCandidateMasterSeq(
          sport, year, round, candidate, marketMatches, ajaxHeaders
        );

        if (isValid14) {
          verifiedMasterSeqCache.set(cacheKey, {
            sport,
            year,
            round,
            masterSeq: candidate,
            sampleHomeTeam: marketMatches[0].homeTeam,
            sampleAwayTeam: marketMatches[0].awayTeam,
            verifiedAt: new Date().toISOString()
          });

          return {
            masterSeq: candidate,
            source: "resolved",
            validationDetails: {
              sport,
              year,
              round,
              masterSeq: candidate,
              candidatesTested,
              sampleMatchCount: sampleMatches,
              fullMatchCount: fullMatches,
              status: "VALID"
            }
          };
        }
      }
    }
  }

  // 3. Secondary Path: Targeted candidate window scan around known historical clusters
  const targetH1 = normalizeTeamName(marketMatches[0]?.homeTeam || "");
  const targetA1 = normalizeTeamName(marketMatches[0]?.awayTeam || "");
  const targetH2 = normalizeTeamName(marketMatches[1]?.homeTeam || "");

  // Candidate anchor centers based on year
  let anchorCenters: number[] = [];
  if (year === 2024) anchorCenters = [26500, 27400, 27530, 26000, 27000, 27800];
  else if (year === 2025) anchorCenters = [28292, 28493, 28848, 28856, 28926, 29206];
  else if (year === 2026) anchorCenters = [30318, 30939, 31345, 31728];

  for (const center of anchorCenters) {
    const windowSeqs: number[] = [];
    for (let offset = -40; offset <= 40; offset += 5) {
      windowSeqs.push(center + offset);
    }

    const responses = await Promise.all(
      windowSeqs.map(seq => {
        const url = `https://www.wisetoto.com/util/gameinfo/get_toto_list.htm?game_category=${sport}&game_info_master_seq=${seq}&tab_type=toto`;
        return fetchEucKrBuffer(url, ajaxHeaders).then(res => ({ seq, res }));
      })
    );

    for (const item of responses) {
      if (item.res.status === 200 && item.res.len > 2000) {
        const normText = normalizeTeamName(item.res.text);
        if (targetH1 && normText.includes(targetH1) && (normText.includes(targetA1) || normText.includes(targetH2))) {
          candidatesTested++;
          const { sampleMatches, fullMatches, isValid14 } = await testCandidateMasterSeq(
            sport, year, round, item.seq, marketMatches, ajaxHeaders
          );

          if (isValid14) {
            verifiedMasterSeqCache.set(cacheKey, {
              sport,
              year,
              round,
              masterSeq: item.seq,
              sampleHomeTeam: marketMatches[0].homeTeam,
              sampleAwayTeam: marketMatches[0].awayTeam,
              verifiedAt: new Date().toISOString()
            });

            return {
              masterSeq: item.seq,
              source: "resolved",
              validationDetails: {
                sport,
                year,
                round,
                masterSeq: item.seq,
                candidatesTested,
                sampleMatchCount: sampleMatches,
                fullMatchCount: fullMatches,
                status: "VALID"
              }
            };
          }
        }
      }
    }
  }

  return {
    masterSeq: null,
    source: "failed",
    validationDetails: {
      sport,
      year,
      round,
      masterSeq: null,
      candidatesTested,
      sampleMatchCount: 0,
      fullMatchCount: 0,
      status: "UNRESOLVED"
    }
  };
}

export function getMasterSeqStats() {
  return {
    cachedCount: verifiedMasterSeqCache.size,
    entries: Array.from(verifiedMasterSeqCache.values())
  };
}

export function clearMasterSeqCache() {
  verifiedMasterSeqCache.clear();
}
