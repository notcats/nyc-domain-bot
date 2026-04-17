const NYC = ['nyc', 'newyork', 'new-york', 'manhattan', 'brooklyn', 'queens', 'bronx', 'statenisland'];
const EXCLUDE = ['parking', 'casino', 'pharma', 'adult', 'xxx', 'porn', 'spam', 'poker', 'bet', 'drug', 'pills'];

export const matchesNYC = d => NYC.some(k => d.toLowerCase().includes(k));
export const isExcluded = d => EXCLUDE.some(k => d.toLowerCase().includes(k));

export function meetsMetrics({ tld, bl, aby, acr } = {}) {
  if (tld && tld !== '.com') return false;
  if (bl  != null && bl  > 0 && bl  < 15)   return false;
  if (aby != null && aby > 0 && aby > 2018)  return false;
  if (acr != null && acr > 0 && acr < 5)    return false;
  return true;
}

export function filterDomain(domain, metrics = {}) {
  return matchesNYC(domain) && !isExcluded(domain) && meetsMetrics(metrics);
}

export function guessNiche(domain) {
  const d = domain.toLowerCase();
  if (/law|legal|attorney|lawyer/.test(d))            return 'Legal NYC';
  if (/realestate|realty|property|homes?|apt/.test(d)) return 'Real Estate';
  if (/restaurant|food|diner|cafe|pizza|kitchen/.test(d)) return 'Food & Dining';
  if (/hotel|inn|hostel|stay/.test(d))                return 'Hospitality';
  if (/health|medical|doctor|dental|clinic/.test(d))  return 'Healthcare';
  if (/tech|digital|web|app|software/.test(d))        return 'Tech';
  if (/news|media|press|blog/.test(d))                return 'Media';
  if (/shop|store|buy|market/.test(d))                return 'E-commerce';
  return 'General NYC';
}
