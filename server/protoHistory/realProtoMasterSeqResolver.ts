/**
 * SportsQuant Pro — Real WiseToto PROTO Master Sequence Resolver
 * 
 * [ABSOLUTE GUARDRAILS]
 * 1. Resolves genuine master sequence from official WiseToto HTML.
 * 2. Strict zero-fallback: Returns null if masterSeq cannot be verified from live page.
 * 3. Never produces random, synthetic, or estimated sequence IDs.
 */

import https from "https";
import iconv from "iconv-lite";

export interface MasterSeqResolutionResult {
  year: number;
  round: number;
  masterSeq: string | null;
  resolvedFrom: string;
  success: boolean;
  error?: string;
}

function fetchBuffer(url: string, headers: Record<string, string> = {}): Promise<{ status: number; buf: Buffer; cookies: string[] }> {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...headers
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      const setCookies = (res.headers["set-cookie"] || []).map(s => s.split(";")[0]);
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 500,
          buf: Buffer.concat(chunks),
          cookies: setCookies
        });
      });
    }).on("error", (err) => resolve({ status: 500, buf: Buffer.alloc(0), cookies: [] }));
  });
}

/**
 * Resolves masterSeq for a specific year and round from WiseToto PROTO index page.
 */
export async function resolveProtoMasterSeq(
  year: number,
  round: number,
  sessionCookie?: string
): Promise<MasterSeqResolutionResult> {
  const url = `https://www.wisetoto.com/index.htm?tab_type=proto&game_type=pt&game_category=pt1&game_year=${year}&game_round=${round}`;
  
  try {
    const headers: Record<string, string> = {
      "Referer": "https://www.wisetoto.com/index.htm?tab_type=proto"
    };
    if (sessionCookie) {
      headers["Cookie"] = sessionCookie;
    }

    const res = await fetchBuffer(url, headers);
    if (res.status !== 200 || res.buf.length === 0) {
      return {
        year,
        round,
        masterSeq: null,
        resolvedFrom: url,
        success: false,
        error: `HTTP status ${res.status}`
      };
    }

    const html = iconv.decode(res.buf, "euc-kr");

    // Pattern 1: get_gameinfo_body('proto','pt1','2026','115','','','31605','','');
    const fnMatch = html.match(/get_gameinfo_body\s*\(\s*['"]proto['"]\s*,\s*['"]pt1['"]\s*,\s*['"]\d+['"]\s*,\s*['"](\d+)['"]\s*,\s*['"]\s*['"]\s*,\s*['"]\s*['"]\s*,\s*['"](\d+)['"]/i);
    if (fnMatch && fnMatch[2]) {
      const resolvedRound = parseInt(fnMatch[1], 10);
      const mSeq = fnMatch[2].trim();
      if (resolvedRound === round && mSeq.length > 0) {
        return {
          year,
          round,
          masterSeq: mSeq,
          resolvedFrom: "get_gameinfo_body inline call",
          success: true
        };
      }
    }

    // Pattern 2: game_info_master_seq input/param
    const paramMatch = html.match(/game_info_master_seq\s*=\s*['"]?(\d+)['"]?/i);
    if (paramMatch && paramMatch[1]) {
      return {
        year,
        round,
        masterSeq: paramMatch[1].trim(),
        resolvedFrom: "game_info_master_seq parameter",
        success: true
      };
    }

    // Pattern 3: links to detail with master_seq
    const linkMatch = html.match(/game_info_master_seq=(\d+)/i);
    if (linkMatch && linkMatch[1]) {
      return {
        year,
        round,
        masterSeq: linkMatch[1].trim(),
        resolvedFrom: "game_info_master_seq url parameter",
        success: true
      };
    }

    return {
      year,
      round,
      masterSeq: null,
      resolvedFrom: url,
      success: false,
      error: "Master sequence not present in official HTML"
    };
  } catch (err: any) {
    return {
      year,
      round,
      masterSeq: null,
      resolvedFrom: url,
      success: false,
      error: err?.message || String(err)
    };
  }
}
