/**
 * SportsQuant Pro — WiseToto REAL Foreign Odds Parser
 * 
 * [ABSOLUTE INVARIANTS]
 * 1. Strictly parses official HTML from get_detail_rate_info.htm.
 * 2. Parses real bookmaker rows (bet365, UNIBET, William Hill, bwin, SBOBET, Ladbrokes, etc.).
 * 3. Extracts real movement indicators (▲ = up, ▼ = down, flat, unknown).
 * 4. Preserves unknown bookmakers dynamically (no truncation).
 * 5. Maintains 100% backward compatibility with exactDomesticRates and exactForeignRates.
 * 6. Zero synthetic, zero derived, zero mock values.
 */

import crypto from "crypto";
import {
  ForeignBookmakerOdds,
  DomesticBookmakerRate,
  OddsMovement,
  ParsedRateInfoResult
} from "./wisetotoForeignOddsTypes.js";

// Known Bookmaker Normalization Dictionary
const KNOWN_BOOKMAKERS: Record<string, string> = {
  "bet365": "bet365",
  "BET365": "bet365",
  "Bet365": "bet365",
  "unibet": "UNIBET",
  "UNIBET": "UNIBET",
  "Unibet": "UNIBET",
  "william hill": "William Hill",
  "williamhill": "William Hill",
  "WILLIAM HILL": "William Hill",
  "William Hill": "William Hill",
  "WilliamHill": "William Hill",
  "bwin": "bwin",
  "BWIN": "bwin",
  "Bwin": "bwin",
  "sbobet": "SBOBET",
  "SBOBET": "SBOBET",
  "Sbobet": "SBOBET",
  "ladbrokes": "Ladbrokes",
  "LADBROKES": "Ladbrokes",
  "Ladbrokes": "Ladbrokes",
  "pinnacle": "Pinnacle",
  "PINNACLE": "Pinnacle",
  "Pinnacle": "Pinnacle",
  "betfair": "Betfair",
  "BETFAIR": "Betfair",
  "Betfair": "Betfair",
  "10bet": "10Bet",
  "10Bet": "10Bet",
  "10BET": "10Bet",
  "marathonbet": "Marathonbet",
  "interwetten": "Interwetten",
  "188bet": "188Bet",
  "dafabet": "Dafabet",
  "betandwin": "bwin",
  "BetAndWin": "bwin",
  "sbobet2": "SBOBET",
  "Sbobet2": "SBOBET",
  "betathome": "bet-at-home",
  "BetAtHome": "bet-at-home"
};

export function normalizeBookmakerName(rawName: string): string {
  const clean = (rawName || "").trim();
  const lower = clean.toLowerCase().replace(/[\s_-]+/g, "");
  
  for (const [key, normalized] of Object.entries(KNOWN_BOOKMAKERS)) {
    if (key.toLowerCase().replace(/[\s_-]+/g, "") === lower) {
      return normalized;
    }
  }
  return clean;
}

export function extractBookmakerNameFromCell(cellHtml: string): string {
  if (!cellHtml) return "";
  const tdAlt = (cellHtml.match(/<td[^>]*\balt=["']([^"']+)["']/i) || [])[1]?.trim();
  if (tdAlt) return tdAlt;
  const imgAlt = (cellHtml.match(/<img[^>]*\balt=["']([^"']+)["']/i) || [])[1]?.trim();
  if (imgAlt) return imgAlt;
  const imgSrc = (cellHtml.match(/\/icon\/([^/.]+)\.(?:png|jpg|gif)/i) || [])[1]?.trim();
  if (imgSrc && !imgSrc.startsWith("ico_") && !imgSrc.startsWith("text_")) return imgSrc;
  return cellHtml.replace(/<[^>]+>/g, "").trim();
}

export function parseOddsMovement(htmlOrText: string): OddsMovement {
  if (!htmlOrText) return "unknown";
  
  if (
    htmlOrText.includes("ico_up.png") ||
    htmlOrText.includes('class="up"') ||
    htmlOrText.includes("class='up'") ||
    htmlOrText.includes("▲") ||
    htmlOrText.includes("↑") ||
    htmlOrText.includes("&#9650;") ||
    htmlOrText.includes("&utrif;")
  ) {
    return "up";
  }
  
  if (
    htmlOrText.includes("ico_down.png") ||
    htmlOrText.includes('class="down"') ||
    htmlOrText.includes("class='down'") ||
    htmlOrText.includes("▼") ||
    htmlOrText.includes("↓") ||
    htmlOrText.includes("&#9660;") ||
    htmlOrText.includes("&dtrif;")
  ) {
    return "down";
  }
  
  const numMatch = htmlOrText.replace(/<[^>]+>/g, "").trim().match(/\d+\.?\d*/);
  if (numMatch && parseFloat(numMatch[0]) > 1.0) {
    return "flat";
  }
  
  return "unknown";
}

export function extractOddsValue(htmlOrText: string): number | null {
  if (!htmlOrText) return null;
  const clean = htmlOrText.replace(/<[^>]+>/g, "").replace(/[▲▼↑↓]/g, "").trim();
  const match = clean.match(/(\d+\.\d+|\d+)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) || val <= 1.0 ? null : val;
}

export interface ParseRateInfoOptions {
  matchId?: string;
  year?: number;
  round?: number;
  gameNo?: number;
  scheduleInfoSeq?: string;
  sport?: string;
  capturedAt?: string;
}

/**
 * Main parser function for WiseToto get_detail_rate_info.htm / get_foreign_rate.htm HTML response
 */
export function parseWisetotoRateInfoHtml(
  rawHtml: string,
  options: ParseRateInfoOptions = {}
): ParsedRateInfoResult {
  const capturedAt = options.capturedAt || new Date().toISOString();
  const matchId = options.matchId || `match_${options.year || 0}_${options.round || 0}_${options.gameNo || options.scheduleInfoSeq || "0"}`;
  
  if (!rawHtml || typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
    return {
      hasData: false,
      matchId,
      capturedAt,
      domestic: null,
      foreignBookmakers: [],
      rawDomesticTds: [],
      rawForeignTds: [],
      rawHash: crypto.createHash("sha256").update("").digest("hex")
    };
  }

  const rawHash = crypto.createHash("sha256").update(rawHtml).digest("hex");
  const cleanHtml = rawHtml.split("|!|")[0];

  // Match table sections (<div class="item_table..."> ... </div>)
  const sections = cleanHtml.match(/<div class=["']item_table[^"']*["']>([\s\S]*?)<\/div>\s*<\/div>/gi) || [];
  
  let rawDomesticTds: string[] = [];
  let rawForeignTds: string[] = [];

  if (sections[0]) {
    rawDomesticTds = (sections[0].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(t => t.replace(/<[^>]+>/g, "").trim());
  }
  if (sections[1]) {
    rawForeignTds = (sections[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(t => t.replace(/<[^>]+>/g, "").trim());
  }

  // 1. Parse Domestic Section
  let domesticRate: DomesticBookmakerRate | null = null;
  if (sections[0]) {
    const domRows = sections[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const row of domRows) {
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      const rowText = row.replace(/<[^>]+>/g, " ").trim();
      
      if (rowText.includes("배당률") || rowText.includes("베트맨") || tds.length >= 3) {
        const nums = tds
          .map(t => extractOddsValue(t))
          .filter((n): n is number => n !== null && n > 1.0);
        
        if (nums.length >= 2) {
          const hasSoccer3Way = nums.length >= 3;
          
          domesticRate = {
            provider: "베트맨",
            homeOdds: nums[0] || null,
            drawOdds: hasSoccer3Way ? (nums[1] || null) : null,
            awayOdds: hasSoccer3Way ? (nums[2] || null) : (nums[1] || null),
            homeVoteRate: null,
            drawVoteRate: null,
            awayVoteRate: null,
            refundRate: null,
            source: "WiseToto",
            provenance: "REAL_EXTERNAL",
            capturedAt
          };
          break;
        }
      }
    }
  }

  // 2. Parse Foreign Bookmakers Table (Section 1 or #dividend_rate / BOOK MAKER table)
  const dividendSectionMatch = cleanHtml.match(/<div[^>]*id=["'](?:dividend_rate|rate_inner_wrap)["'][^>]*>([\s\S]*?)$/i);
  const foreignSectionHtml =
    sections[1] ||
    (dividendSectionMatch ? dividendSectionMatch[1] : "") ||
    (cleanHtml.includes("BOOK MAKER") || cleanHtml.includes("해외 배당") ? cleanHtml : "");
  const foreignBookmakers: ForeignBookmakerOdds[] = [];

  if (foreignSectionHtml) {
    const isSoccer = options.sport === "soccer" || options.sport === "sc" || !options.sport || foreignSectionHtml.includes("무");
    const market = isSoccer ? "1X2" : "MONEYLINE";

    const rows = foreignSectionHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    
    for (const row of rows) {
      // Skip table header rows or empty state rows
      if (row.includes("<th") || row.includes("BOOK MAKER") || row.includes("북메이커") || row.includes("데이터가 없습니다")) {
        continue;
      }

      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 3) continue;

      const rawBookmakerName = extractBookmakerNameFromCell(cells[0]);
      if (!rawBookmakerName || rawBookmakerName === "-" || rawBookmakerName.length < 2) continue;

      const normalizedName = normalizeBookmakerName(rawBookmakerName);

      let homeOdds: number | null = null;
      let drawOdds: number | null = null;
      let awayOdds: number | null = null;
      let homeMovement: OddsMovement = "unknown";
      let drawMovement: OddsMovement = "unknown";
      let awayMovement: OddsMovement = "unknown";

      if (cells.length >= 5) {
        // 5-column table (Handicap or Under/Over where cells[1] is line)
        homeOdds = extractOddsValue(cells[2]);
        homeMovement = parseOddsMovement(cells[2]);

        drawOdds = extractOddsValue(cells[3]);
        drawMovement = parseOddsMovement(cells[3]);

        awayOdds = extractOddsValue(cells[4]);
        awayMovement = parseOddsMovement(cells[4]);
      } else if (cells.length === 4) {
        // 4-column table (Bookmaker, Win, Draw, Lose)
        homeOdds = extractOddsValue(cells[1]);
        homeMovement = parseOddsMovement(cells[1]);

        drawOdds = extractOddsValue(cells[2]);
        drawMovement = parseOddsMovement(cells[2]);

        awayOdds = extractOddsValue(cells[3]);
        awayMovement = parseOddsMovement(cells[3]);
      } else if (cells.length === 3) {
        // 3-column table (Bookmaker, Win, Lose)
        homeOdds = extractOddsValue(cells[1]);
        homeMovement = parseOddsMovement(cells[1]);

        drawOdds = null;
        drawMovement = "unknown";

        awayOdds = extractOddsValue(cells[2]);
        awayMovement = parseOddsMovement(cells[2]);
      }

      if (homeOdds !== null || awayOdds !== null) {
        foreignBookmakers.push({
          bookmaker: rawBookmakerName,
          normalizedName,
          market,
          homeOdds,
          drawOdds,
          awayOdds,
          home: homeOdds,
          draw: drawOdds,
          away: awayOdds,
          homeMovement,
          drawMovement,
          awayMovement,
          movement: {
            home: homeMovement,
            draw: drawMovement,
            away: awayMovement
          },
          source: "WiseToto",
          provenance: "REAL_EXTERNAL",
          capturedAt
        });
      }
    }
  }

  return {
    hasData: foreignBookmakers.length > 0 || domesticRate !== null,
    matchId,
    capturedAt,
    domestic: domesticRate,
    foreignBookmakers,
    rawDomesticTds,
    rawForeignTds,
    rawHash
  };
}
