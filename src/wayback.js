const RED_FLAGS = [
  'domain may be for sale', 'domain is for sale', 'buy this domain',
  'related searches', 'this domain is for sale', 'godaddy',
  'sedoparking', 'sedo.com', 'dan.com', 'hugedomains', 'buy this web',
];

export async function checkWayback(domain) {
  try {
    const cdxUrl =
      `https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=100&fl=timestamp,statuscode`;
    const res  = await fetch(cdxUrl, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();

    if (!Array.isArray(data) || data.length <= 1)
      return { clean: false, reason: 'No snapshots found', snapshots: 0, firstYear: null };

    const rows = data.slice(1);
    const firstYear = rows[0]?.[0] ? parseInt(rows[0][0].slice(0, 4)) : null;

    if (rows.length < 3)
      return { clean: false, reason: `Only ${rows.length} snapshots`, snapshots: rows.length, firstYear };

    const ts  = rows[rows.length - 1][0];
    const snapshotUrl = `https://web.archive.org/web/${ts}/${domain}`;
    const page = await fetch(snapshotUrl, { signal: AbortSignal.timeout(15000) });
    const html = (await page.text()).toLowerCase();

    for (const flag of RED_FLAGS) {
      if (html.includes(flag))
        return { clean: false, reason: `Red flag: "${flag}"`, snapshots: rows.length, snapshotUrl, firstYear };
    }

    return { clean: true, snapshots: rows.length, snapshotUrl, ts, firstYear };
  } catch (e) {
    return { clean: false, reason: e.message, snapshots: 0, firstYear: null };
  }
}

export const waybackLink = domain => `https://web.archive.org/web/*/${domain}`;
