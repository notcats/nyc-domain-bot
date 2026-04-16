import whois from 'whois';

const EXPIRY_PATTERNS = [
  /Registry Expiry Date:\s*(\S+)/i,
  /Expir(?:y|ation) Date:\s*(\S+)/i,
  /paid-till:\s*(\S+)/i,
  /expire:\s*(\S+)/i,
  /Expiry date:\s*(\S+)/i,
];

function parseExpiry(raw) {
  for (const pat of EXPIRY_PATTERNS) {
    const m = raw.match(pat);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d)) return d;
    }
  }
  return null;
}

export function lookupDomain(domain) {
  return new Promise((resolve, reject) => {
    whois.lookup(domain, { timeout: 10000 }, (err, data) => {
      if (err) return reject(new Error(err.message || String(err)));
      if (!data) return reject(new Error('Empty WHOIS response'));
      resolve({ expiry: parseExpiry(data) });
    });
  });
}
