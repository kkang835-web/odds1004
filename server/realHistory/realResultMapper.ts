import { RealMatchOutcome } from "./realHistoryTypes.js";

export interface ParsedRawResult {
  matchNo: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  outcomeTag: string | null;
  outcome: RealMatchOutcome;
  rawLineHtml: string;
}

/**
 * Parses raw HTML snippet from get_toto_list.htm for 14 matches.
 * Strictly avoids synthetic or simulated values.
 */
export function parseTotoListResults(html: string): ParsedRawResult[] {
  const results: ParsedRawResult[] = [];

  for (let m = 1; m <= 14; m++) {
    const lineMatch = html.match(new RegExp(`<div id=["\x27]line${m}["\x27]>[\\s\\S]*?(?=<div id=["\x27]line${m}n["\x27]>|<div id=["\x27]line${m+1}["\x27]>|$)`))
      || html.match(new RegExp(`<div id=["\x27]line${m}["\x27]>[\\s\\S]*?</div>\\s*</div>`));
    const block = lineMatch ? lineMatch[0] : "";

    const resMatch = html.match(new RegExp(`<div id=["\x27]result_info_${m}["\x27]>([\\s\\S]*?)<\\/div>`));
    const homeMatch = html.match(new RegExp(`<div id=["\x27]home_team_info_${m}["\x27]>([\\s\\S]*?)<\\/div>`));
    const awayMatch = html.match(new RegExp(`<div id=["\x27]away_team_info_${m}["\x27]>([\\s\\S]*?)<\\/div>`));

    const rawTag = resMatch ? resMatch[1].replace(/<[^>]+>/g, "").trim() : null;
    const hTeam = homeMatch ? (homeMatch[1].match(/class=["\x27]stu["\x27][^>]*>([^<]+)<\/a>/) || [])[1] : "";
    const aTeam = awayMatch ? (awayMatch[1].match(/class=["\x27]stu["\x27][^>]*>([^<]+)<\/a>/) || [])[1] : "";

    // Extract score from either dgray1201b or or1201b
    const hScore = homeMatch ? (homeMatch[1].match(/class=["\x27](?:dgray1201b|or1201b)[^"'\x27]*["\x27]>(\d+)<\/span>/) || homeMatch[1].match(/>(\d+)<\/span>/) || [])[1] : null;
    const aScore = awayMatch ? (awayMatch[1].match(/class=["\x27](?:dgray1201b|or1201b)[^"'\x27]*["\x27]>(\d+)<\/span>/) || awayMatch[1].match(/>(\d+)<\/span>/) || [])[1] : null;

    let outcome: RealMatchOutcome = null;
    if (rawTag) {
      if (rawTag.includes("홈승") || rawTag === "승") outcome = "win";
      else if (rawTag.includes("무승부") || rawTag === "무" || rawTag === "1" || rawTag === "5") outcome = "draw";
      else if (rawTag.includes("홈패") || rawTag.includes("원정승") || rawTag === "패") outcome = "lose";
      else if (rawTag.includes("취소") || rawTag.includes("연기")) outcome = "canceled";
    }

    // Secondary deduction from scores if outcome tag is ambiguous but scores exist
    if (!outcome && hScore !== undefined && aScore !== undefined && hScore !== null && aScore !== null) {
      const numH = parseInt(hScore, 10);
      const numA = parseInt(aScore, 10);
      if (!isNaN(numH) && !isNaN(numA)) {
        if (numH > numA) outcome = "win";
        else if (numH === numA) outcome = "draw";
        else outcome = "lose";
      }
    }

    results.push({
      matchNo: m,
      homeTeam: (hTeam || "").trim(),
      awayTeam: (aTeam || "").trim(),
      homeScore: hScore ? parseInt(hScore, 10) : null,
      awayScore: aScore ? parseInt(aScore, 10) : null,
      outcomeTag: rawTag,
      outcome,
      rawLineHtml: block
    });
  }

  return results;
}
