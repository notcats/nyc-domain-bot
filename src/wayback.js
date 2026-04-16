const RED_FLAGS = [
  'domain may be for sale', 'domain is for sale', 'buy this domain',
  'related searches', 'this domain is for sale', 'godaddy',
  'sedoparking', 'sedo.com', 'dan.com', 'hugedomains', 'buy this web',
];

export async function checkWayback(domain) {
  try {
    const cdxUrl =
      `https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=20&fl=timestamp,statuscode`;
    const res  = await fetch(cdxUrl, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();

    if (!Array.isArray(data) || data.length <= 1)
      return { clean: false, reason: 'No snapshots found', snapshots: 0 };

    const rows = data.slice(1);
    if (rows.length < 5)
      return { clean: false, reason: `Only ${rows.length} snapshots`, snapshots: rows.length };

    // Sample the latest snapshot HTML for red-flag text
    const ts  = rows[rows.length - 1][0];
    const snapshotUrl = `https://web.archive.org/web/${ts}/${domain}`;
    const page = await fetch(snapshotUrl, { signal: AbortSignal.timeout(15000) });
    const html = (await page.text()).toLowerCase();

    for (const flag of RED_FLAGS) {
      if (html.includes(flag))
        return { clean: false, reason: `Red flag: "${flag}"`, snapshots: rows.length, snapshotUrl };
    }

    return { clean: true, snapshots: rows.length, snapshotUrl, ts };
  } catch (e) {
    return { clean: false, reason: e.message, snapshots: 0 };
  }
}

export const waybackLink = domain => `https://web.archive.org/web/*/${domain}`;
