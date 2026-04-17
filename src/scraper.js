import { guessNiche } from './filter.js';

const GD_KEY    = process.env.GODADDY_KEY;
const GD_SECRET = process.env.GODADDY_SECRET;
const GD_BASE   = process.env.GODADDY_ENV === 'ote'
  ? 'https://api.ote-godaddy.com'
  : 'https://api.godaddy.com';

const WORDLIST = [
  'nyclaw.com','nyclawyer.com','nyclegal.com','nycattorney.com',
  'nycrealty.com','nycrealestate.com','nycrealtor.com','nychomes.com','nycproperty.com',
  'nycplumber.com','nycplumbing.com','nycelectrician.com','nychvac.com',
  'nycdentist.com','nycdental.com','nycclinic.com','nycmedical.com','nycdoctor.com',
  'nycrestaurant.com','nycdiner.com','nyccafe.com','nycpizza.com','nycbar.com','nycwine.com',
  'nychotel.com','nycinn.com','nycmovers.com','nycmoving.com','nycstorage.com',
  'nyccleaning.com','nycconstruction.com','nyccontractor.com','nycroofing.com','nycpainting.com',
  'nycflooring.com','nyclocksmith.com','nycgym.com','nycfitness.com','nycyoga.com','nycspa.com',
  'nyccatering.com','nycbakery.com','nycflorist.com','nycjewelry.com','nycsalon.com',
  'nycconsulting.com','nycmarketing.com','nycaccounting.com','nyctax.com','nyccpa.com',
  'nycinsurance.com','nycmortgage.com','nycfinance.com','nycloans.com','nycbroker.com',
  'nycrepair.com','nycfloor.com','nyctutor.com','nyccoach.com','nycschool.com',
  'nycpet.com','nycvet.com','nycpharmacy.com','nycprint.com','nycshipping.com',
  'nycbusiness.com','nycguide.com','nyclife.com','nycliving.com','nyclocal.com',
  'nycpro.com','nycpros.com','nycexpert.com','nycbest.com','nycnews.com','nycmedia.com',
  'nyc-law.com','nyc-legal.com','nyc-realty.com','nyc-dental.com',
  'nyc-medical.com','nyc-fitness.com','nyc-catering.com','nyc-contractor.com',
  'nyc-cleaning.com','nyc-movers.com','nyc-plumber.com','nyc-guide.com',
  'newyorklaw.com','newyorklawyer.com','newyorklegal.com','newyorkattorney.com',
  'newyorkrealty.com','newyorkrealestate.com','newyorkdentist.com','newyorkmedical.com',
  'newyorkhotel.com','newyorkmovers.com','newyorkcleaning.com','newyorkgym.com',
  'newyorkconsulting.com','newyorkmarketing.com','newyorkaccounting.com',
  'newyorkinsurance.com','newyorkmortgage.com','newyorkcontractor.com',
  'newyorkrestaurant.com','newyorkbusiness.com','newyorkguide.com',
  'manhattanlaw.com','manhattanlawyer.com','manhattanlegal.com',
  'manhattanrealty.com','manhattanrealestate.com','manhattandentist.com',
  'manhattandental.com','manhattanmedical.com','manhattanhotel.com',
  'manhattanmovers.com','manhattancleaning.com','manhattangym.com','manhattanfitness.com',
  'manhattanconsulting.com','manhattanmarketing.com','manhattanaccounting.com',
  'manhattancontractor.com','manhattanmortgage.com','manhattaninsurance.com',
  'manhattan-law.com','manhattan-realty.com','manhattan-dental.com',
  'brooklynlaw.com','brooklynlawyer.com','brooklynlegal.com',
  'brooklynrealty.com','brooklynrealestate.com','brooklyndentist.com',
  'brooklyndiner.com','brooklyncafe.com','brooklynpizza.com','brooklynhotel.com',
  'brooklynmovers.com','brooklyncleaning.com','brooklyngym.com','brooklynfitness.com',
  'brooklyncatering.com','brooklynbakery.com','brooklyncontractor.com',
  'brooklynbusiness.com','brooklyn-law.com','brooklyn-realty.com',
  'queenslaw.com','queenslawyer.com','queensrealty.com','queensdentist.com',
  'queensmedical.com','queensmovers.com','queenscleaning.com','queensgym.com',
  'queenscatering.com','queenscontractor.com','queensbusiness.com',
  'bronxlaw.com','bronxlawyer.com','bronxrealty.com','bronxdentist.com',
  'bronxmedical.com','bronxmovers.com','bronxcleaning.com','bronxgym.com',
  'bronxcontractor.com','bronxplumber.com','bronxbusiness.com',
];

let scanIndex = 0;

async function checkAvailability(domain) {
  if (!GD_KEY || !GD_SECRET) {
    throw new Error('GODADDY_KEY / GODADDY_SECRET not set');
  }
  const res = await fetch(
    `${GD_BASE}/v1/domains/available?domain=${domain}&checkType=FAST`,
    {
      headers: {
        'Authorization': `sso-key ${GD_KEY}:${GD_SECRET}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json(); // { available, price, currency, definitive }
}

export async function scrapeExpiredDomains() {
  if (!GD_KEY || !GD_SECRET) {
    console.error('GoDaddy API keys not set — skipping scrape');
    return [];
  }

  const results = [];
  const BATCH = 40;

  for (let i = 0; i < BATCH; i++) {
    const domain = WORDLIST[(scanIndex + i) % WORDLIST.length];
    try {
      const data = await checkAvailability(domain);
      if (data.available) {
        // price is in micro-units (1/1,000,000 USD)
        const priceUSD = Math.round((data.price || 0) / 1e6);
        if (priceUSD <= 50) { // skip premium domains
          results.push({
            domain,
            bl: 0, aby: 0, acr: 0,
            price: priceUSD > 0 ? `$${priceUSD}` : undefined,
            source: 'godaddy-api',
            niche: guessNiche(domain),
          });
        } else {
          console.log(`${domain}: skip premium $${priceUSD}`);
        }
      }
    } catch (e) {
      console.error(`GoDaddy[${domain}]: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  scanIndex = (scanIndex + BATCH) % WORDLIST.length;
  console.log(`scrapeExpiredDomains: ${results.length} available`);
  return results;
}

export async function debugScrape() {
  if (!GD_KEY || !GD_SECRET) {
    return ['GODADDY_KEY / GODADDY_SECRET не установлены — добавь в Railway Variables'];
  }

  const env = process.env.GODADDY_ENV || 'production';
  const lines = [`Используется: ${GD_BASE} (env: ${env})`, ''];

  for (const domain of WORDLIST.slice(0, 8)) {
    try {
      const data = await checkAvailability(domain);
      const priceUSD = Math.round((data.price || 0) / 1e6);
      const status = data.available
        ? (priceUSD > 50 ? `премиум $${priceUSD}` : `свободен $${priceUSD} ✅`)
        : 'занят ❌';
      lines.push(`${domain}: ${status}`);
    } catch (e) {
      lines.push(`${domain}: ошибка — ${e.message.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return lines;
}
