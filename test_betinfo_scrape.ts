import fs from "fs";
import iconv from "iconv-lite";

const TEMP_HTML_PATH = "/tmp/betinfo_response.html";
const TEMP_META_PATH = "/tmp/betinfo_meta.json";

export async function fetchOrGetBetinfoHtml() {
  if (fs.existsSync(TEMP_HTML_PATH) && fs.existsSync(TEMP_META_PATH)) {
    console.log(`[Cache] Using existing single-fetched response from ${TEMP_HTML_PATH}`);
    const meta = JSON.parse(fs.readFileSync(TEMP_META_PATH, "utf8"));
    const html = fs.readFileSync(TEMP_HTML_PATH, "utf8");
    return { ...meta, html };
  }

  const targetUrl = "https://www.betinfo.co.kr/z_protorate/protoRate2.asp";
  console.log(`[Single Fetch] Requesting: ${targetUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const startTime = Date.now();
  const res = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    signal: controller.signal,
    redirect: "follow",
  });
  clearTimeout(timeoutId);
  const durationMs = Date.now() - startTime;

  const statusCode = res.status;
  const finalUrl = res.url;
  const contentType = res.headers.get("content-type") || "";

  if (statusCode === 403 || statusCode === 429) {
    throw new Error(`Access restricted or rate limited: HTTP ${statusCode}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP Error: ${statusCode} ${res.statusText}`);
  }

  const rawBuffer = Buffer.from(await res.arrayBuffer());

  let encoding = "euc-kr";
  if (contentType.toLowerCase().includes("utf-8")) {
    encoding = "utf-8";
  }

  let decodedHtml = iconv.decode(rawBuffer, encoding);
  if (decodedHtml.includes("charset=utf-8") || decodedHtml.includes("charset=\"utf-8\"")) {
    encoding = "utf-8";
    decodedHtml = iconv.decode(rawBuffer, "utf-8");
  } else if (decodedHtml.includes("euc-kr") || decodedHtml.includes("EUC-KR") || decodedHtml.includes("ks_c_5601-1987")) {
    encoding = "euc-kr";
    decodedHtml = iconv.decode(rawBuffer, "euc-kr");
  }

  const meta = {
    statusCode,
    finalUrl,
    encoding,
    durationMs,
    byteLength: rawBuffer.length,
    htmlLength: decodedHtml.length,
    contentType,
    fetchedAt: new Date().toISOString(),
  };

  fs.writeFileSync(TEMP_HTML_PATH, decodedHtml, "utf8");
  fs.writeFileSync(TEMP_META_PATH, JSON.stringify(meta, null, 2), "utf8");
  console.log(`[Success] Saved single fetch response to ${TEMP_HTML_PATH} (${meta.byteLength} bytes)`);

  return { ...meta, html: decodedHtml };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchOrGetBetinfoHtml().then(res => {
    console.log("Fetch metadata:", {
      statusCode: res.statusCode,
      finalUrl: res.finalUrl,
      encoding: res.encoding,
      byteLength: res.byteLength,
      htmlLength: res.htmlLength,
    });
  }).catch(err => {
    console.error("Fetch failed:", err);
  });
}
