const KEY = process.env.MAJESTIC_KEY;

export async function getMetrics(domain) {
  if (!KEY) return null;
  try {
    const url = `https://api.majestic.com/api/json?app_api_key=${KEY}&cmd=GetIndexItemInfo&items=1&item0=${domain}&datasource=fresh`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json.DataTables?.Results?.Data?.[0];
    if (!item) return null;
    return {
      tf: item.TrustFlow    ?? 0,
      cf: item.CitationFlow ?? 0,
      rd: item.RefDomains   ?? 0,
    };
  } catch {
    return null;
  }
}
