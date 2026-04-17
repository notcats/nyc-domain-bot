import { guessNiche } from './filter.js';

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

// Verisign is the authoritative .com registry — 404 = truly unregistered
async function isAvailable(domain) {
  const res = await fetch(
    `https://rdap.verisign.com/com/v1/domain/${domain.replace(/\.com$/, '')}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (res.status === 404) return true;   // not in registry = available
  if (res.status === 200) return false;  // registered
  throw new Error(`RDAP ${res.status}`);
}

export async function scrapeExpiredDomains() {
  const results = [];
  const BATCH = 40;

  for (let i = 0; i < BATCH; i++) {
    const domain = WORDLIST[(scanIndex + i) % WORDLIST.length];
    try {
      if (await isAvailable(domain)) {
        results.push({ domain, bl: 0, aby: 0, acr: 0, source: 'verisign-rdap', niche: guessNiche(domain) });
      }
    } catch (e) {
      console.error(`RDAP[${domain}]: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  scanIndex = (scanIndex + BATCH) % WORDLIST.length;
  console.log(`scrapeExpiredDomains: ${results.length} available`);
  return results;
}

export async function debugScrape() {
  const lines = ['Источник: Verisign RDAP (авторитетный реестр .com)', ''];
  for (const domain of WORDLIST.slice(0, 10)) {
    try {
      const avail = await isAvailable(domain);
      lines.push(`${domain}: ${avail ? 'свободен ✅' : 'занят ❌'}`);
    } catch (e) {
      lines.push(`${domain}: ошибка — ${e.message.slice(0, 50)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return lines;
}
