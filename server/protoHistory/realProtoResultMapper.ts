/**
 * SportsQuant Pro — Real PROTO Match & Result Mapper
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Strict parsing of official WiseToto get_proto_list.htm response.
 * 2. Real scores only: If scores are absent in HTML, score = null (never inverted from outcome).
 * 3. Real domestic odds only: Captured directly from .pt spans.
 * 4. Zero synthetic, estimated, or fallback values.
 */

import { RealProtoGameType, RealProtoSport, RealProtoOutcome, RealProtoScore, RealProtoDomesticOdds } from "./realProtoHistoryTypes.js";

export interface ParsedRawProtoMatch {
  matchNo: number;
  dateStr: string;
  sport: RealProtoSport;
  rawSport: string;
  league: string;
  gameType: RealProtoGameType;
  handicapOrTarget: string | null;
  homeTeam: string;
  awayTeam: string;
  domesticOdds: RealProtoDomesticOdds;
  homeScore: number | null;
  awayScore: number | null;
  outcomeTag: string | null;
  outcome: RealProtoOutcome;
  scheduleInfoSeq: string | null;
  rawBlockHtml: string;
}

/**
 * Maps raw sport code (sc, bs, bk, vl, hk, etc.) to RealProtoSport
 */
export function mapProtoSport(rawSport: string): RealProtoSport {
  const s = (rawSport || "").toLowerCase().trim();
  if (s.includes("sc") || s.includes("ft") || s.includes("soccer")) return "sc";
  if (s.includes("bs") || s.includes("baseball")) return "bs";
  if (s.includes("bk") || s.includes("basketball")) return "bk";
  if (s.includes("vl") || s.includes("volleyball")) return "vl";
  return "etc";
}

/**
 * Maps outcome tag to standard RealProtoOutcome
 */
export function mapProtoOutcome(tag: string | null, homeScore: number | null, awayScore: number | null): RealProtoOutcome {
  if (tag) {
    const t = tag.trim();
    if (t.includes("홈승") || t === "승" || t.includes("핸디승")) return "win";
    if (t.includes("무승부") || t === "무") return "draw";
    if (t.includes("홈패") || t.includes("원정승") || t === "패" || t.includes("핸디패")) return "lose";
    if (t.includes("오버")) return "win"; // Over hit
    if (t.includes("언더")) return "lose"; // Under hit
    if (t.includes("홀")) return "win";
    if (t.includes("짝")) return "lose";
    if (t.includes("취소") || t.includes("특례") || t.includes("연기")) return "canceled";
  }

  // Fallback ONLY to real scores if both home and away scores are officially present
  if (homeScore !== null && awayScore !== null && !isNaN(homeScore) && !isNaN(awayScore)) {
    if (homeScore > awayScore) return "win";
    if (homeScore === awayScore) return "draw";
    if (homeScore < awayScore) return "lose";
  }

  return null;
}

/**
 * Parses official get_proto_list.htm response into structured raw matches
 */
export function parseProtoListHtml(html: string): ParsedRawProtoMatch[] {
  const results: ParsedRawProtoMatch[] = [];
  const ulBlocks = html.match(/<ul[^>]*>[\s\S]*?<\/ul>/gi) || [];

  for (const block of ulBlocks) {
    const matchNoMatch = block.match(/<li class=["']a1["']>(\d+)<\/li>/i);
    if (!matchNoMatch) continue;
    const matchNo = parseInt(matchNoMatch[1], 10);

    const dateMatch = block.match(/<li class=["']a2["']>([^<]+)<\/li>/i);
    const dateStr = dateMatch ? dateMatch[1].trim() : "";

    const sportMatch = block.match(/<li class=["']a3\s+([a-zA-Z0-9_-]+)["']>/i);
    const rawSport = sportMatch ? sportMatch[1].trim() : "etc";
    const sport = mapProtoSport(rawSport);

    const leagueMatch = block.match(/<li class=["']a4["']>([^<]+)<\/li>/i);
    const league = leagueMatch ? leagueMatch[1].trim() : "";

    // Determine Game Type
    const hmMatch = block.match(/<li class=["']hm["']>([^<]*)<\/li>/i);
    const unMatch = block.match(/<li class=["']un["']>([^<]*)<\/li>/i);
    const d5Match = block.match(/<li class=["']d5["'][^>]*>([^<]*)<\/li>/i);
    
    let gameType: RealProtoGameType = "일반";
    let handicapOrTarget: string | null = null;

    if (hmMatch && hmMatch[1].trim().length > 0) {
      gameType = "핸디캡";
      handicapOrTarget = hmMatch[1].trim();
    } else if (unMatch && unMatch[1].trim().length > 0) {
      gameType = "언더오버";
      handicapOrTarget = unMatch[1].trim();
    } else if (d5Match && d5Match[1].includes("SUM")) {
      gameType = "SUM";
      handicapOrTarget = "SUM";
    }

    // Teams
    let homeTeam = "";
    let awayTeam = "";
    const teamMatches = [...block.matchAll(/<span class=["']tn[b]?["'][^>]*>([^<]+)<\/span>/gi)];
    if (teamMatches.length >= 2) {
      homeTeam = teamMatches[0][1].trim();
      awayTeam = teamMatches[1][1].trim();
    }

    // Scores
    let homeScore: number | null = null;
    let awayScore: number | null = null;

    // Standard score matching
    const scoreMatches = [...block.matchAll(/<span class=["'](?:win|lose|draw|dgray\d*b?|or\d*b?)["']>(\d+)<\/span>/gi)];
    if (scoreMatches.length >= 2) {
      homeScore = parseInt(scoreMatches[0][1], 10);
      awayScore = parseInt(scoreMatches[1][1], 10);
    } else if (gameType === "언더오버" || gameType === "SUM") {
      // For single total score displays (e.g. <li class="a7_un"><span class="win">7</span></li>)
      const totalScoreMatch = block.match(/<li class=["']a7_un["']><span[^>]*>(\d+)<\/span><\/li>/i);
      if (totalScoreMatch) {
        homeScore = parseInt(totalScoreMatch[1], 10);
        awayScore = null;
      }
    }

    // Official Domestic Odds
    const oddsMatches = [...block.matchAll(/<li class=["']a9["']>[\s\S]*?class=["']pt["']>([0-9.]+)<\/span>/gi)];
    let domWin: number | null = null;
    let domDraw: number | null = null;
    let domLose: number | null = null;

    if (oddsMatches.length === 3) {
      domWin = parseFloat(oddsMatches[0][1]);
      domDraw = parseFloat(oddsMatches[1][1]);
      domLose = parseFloat(oddsMatches[2][1]);
    } else if (oddsMatches.length === 2) {
      domWin = parseFloat(oddsMatches[0][1]);
      domDraw = null;
      domLose = parseFloat(oddsMatches[1][1]);
    } else if (oddsMatches.length === 1) {
      domWin = parseFloat(oddsMatches[0][1]);
    }

    // Outcome Tag
    const tagMatch = block.match(/<span class=["']tag[^"']*["']>([^<]+)<\/span>/i);
    const outcomeTag = tagMatch ? tagMatch[1].trim() : null;

    // Derived Outcome (Strictly from official tag / scores)
    const outcome = mapProtoOutcome(outcomeTag, homeScore, awayScore);

    // Schedule info seq (for provenance & detail links)
    const scheduleMatch = block.match(/(?:id=["']db(\d+)_\d+["']|get_gameinfo_detail\(['"](\d+)['"])/i);
    const scheduleInfoSeq = scheduleMatch ? (scheduleMatch[1] || scheduleMatch[2]) : null;

    results.push({
      matchNo,
      dateStr,
      sport,
      rawSport,
      league,
      gameType,
      handicapOrTarget,
      homeTeam,
      awayTeam,
      domesticOdds: {
        win: isNaN(domWin as any) ? null : domWin,
        draw: isNaN(domDraw as any) ? null : domDraw,
        lose: isNaN(domLose as any) ? null : domLose
      },
      homeScore: (homeScore !== null && !isNaN(homeScore)) ? homeScore : null,
      awayScore: (awayScore !== null && !isNaN(awayScore)) ? awayScore : null,
      outcomeTag,
      outcome,
      scheduleInfoSeq,
      rawBlockHtml: block
    });
  }

  return results;
}
