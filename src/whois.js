import net from 'net';

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

function rawWhois(server, query) {
  return new Promise((resolve, reject) => {
    let data = '';
    const socket = net.createConnection(43, server);
    socket.setTimeout(10000);
    socket.on('connect', () => socket.write(query + '\r\n'));
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('WHOIS timeout')); });
  });
}

export async function lookupDomain(domain) {
  // Ask IANA which WHOIS server handles this TLD
  const ianaData = await rawWhois('whois.iana.org', domain);
  const serverMatch = ianaData.match(/whois:\s+(\S+)/i);

  let response = ianaData;
  if (serverMatch) {
    try {
      response = await rawWhois(serverMatch[1], domain);
    } catch {
      // fall back to IANA response
    }
  }

  return { expiry: parseExpiry(response) };
}
