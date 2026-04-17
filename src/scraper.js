import { guessNiche } from './filter.js';

const WORDLIST = [
  // nyc + niche
  'nyclaw.com','nyclawyer.com','nyclegal.com','nycattorney.com',
  'nycrealty.com','nycrealestate.com','nycrealtor.com','nychomes.com','nycproperty.com',
  'nycplumber.com','nycplumbing.com','nycelectrician.com','nychvac.com',
  'nycdentist.com','nycdental.com','nycclinic.com','nycmedical.com','nycdoctor.com',
  'nycrestaurant.com','nycdiner.com','nyccafe.com','nycpizza.com','nycbar.com','nycwine.com',
  'nychotel.com','nycinn.com','nycmovers.com','nycmoving.com','nycstorage.com',
  'nyccleaning.com','nycconstruction.com','nyccontractor.com','nycroofing.com','nycpainting.com',
  'nycooring.com','nyclocksmith.com','nycgym.com','nycfitness.com','nycyoga.com','nycspa.com',
  'nyccatering.com','nycbakery.com','nycflorist.com','nycjewelry.com','nycsalon.com',
  'nycconsulting.com','nycmarketing.com','nycaccounting.com','nyctax.com','nyccpa.com',
  'nycinsurance.com','nycmortgage.com','nycfinance.com','nycloans.com','nycbroker.com',
  'nycrepair.com','nycfloor.com','nyctutor.com','nyccoach.com','nycschool.com',
  'nycpet.com','nycvet.com','nycpharmacy.com','nycprint.com','nycshipping.com',
  'nycbusiness.com','nycguide.com','nyclife.com','nycliving.com','nyclocal.com',
  'nycpro.com','nycpros.com','nycexpert.com','nycservice.com','nycservices.com',
  'nycbest.com','nycnews.com','nycmedia.com','nycblog.com',
  // nyc + hyphen
  'nyc-law.com','nyc-legal.com','nyc-realty.com','nyc-dental.com',
  'nyc-medical.com','nyc-fitness.com','nyc-catering.com','nyc-contractor.com',
  'nyc-cleaning.com','nyc-movers.com','nyc-plumber.com','nyc-guide.com',
  // newyork
  'newyorklaw.com','newyorklawyer.com','newyorklegal.com','newyorkattorney.com',
  'newyorkrealty.com','newyorkrealestate.com','newyorkdentist.com','newyorkmedical.com',
  'newyorkhotel.com','newyorkmovers.com','newyorkcleaning.com','newyorkgym.com',
  'newyorkconsulting.com','newyorkmarketing.com','newyorkaccounting.com',
  'newyorkinsurance.com','newyorkmortgage.com','newyorkcontractor.com',
  'newyorkrestaurant.com','newyorkbusiness.com','newyorkguide.com',
  // manhattan
  'manhattanlaw.com','manhattanlawyer.com','manhattanlegal.com',
  'manhattanrealty.com','manhattanrealestate.com','manhattandentist.com',
  'manhattandental.com','manhattanmedical.com','manhattanhotel.com',
  'manhattanmovers.com','manhattancleaning.com','manhattangym.com','manhattanfitness.com',
  'manhattanconsulting.com','manhattanmarketing.com','manhattanaccounting.com',
  'manhattancontractor.com','manhattanmortgage.com','manhattaninsurance.com',
  'manhattan-law.com','manhattan-realty.com','manhattan-dental.com',
  // brooklyn
  'brooklynlaw.com','brooklynlawyer.com','brooklynlegal.com',
  'brooklynrealty.com','brooklynrealestate.com','brooklyndentist.com',
  'brooklyndiner.com','brooklyncafe.com','brooklynpizza.com','brooklynhotel.com',
  'brooklynmovers.com','brooklyncleaning.com','brooklyngym.com','brooklynfitness.com',
  'brooklyncatering.com','brooklynbakery.com','brooklyncontractor.com',
  'brooklynbusiness.com','brooklynguide.com','brooklyn-law.com','brooklyn-realty.com',
  // queens
  'queenslaw.com','queenslawyer.com','queensrealty.com','queensdentist.com',
  'queensmedical.com','queensmovers.com','queenscleaning.com','queensgym.com',
  'queenscatering.com','queenscontractor.com','queensbusiness.com',
  // bronx
  'bronxlaw.com','bronxlawyer.com','bronxrealty.com','bronxdentist.com',
  'bronxmedical.com','bronxmovers.com','bronxcleaning.com','bronxgym.com',
  'bronxcontractor.com','bronxplumber.com','bronxbusiness.com',
];

let scanIndex = 0;

async function isDomainExpired(domain) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return true;
    if (res.ok) {
      const data = await res.json();
      const exp = (data.events || []).find(e => e.eventAction === 'expiration');
      if (exp && new Date(exp.eventDate) < new Date()) return true;
    }
    return false;
  } catch { return true; }
}

export async function scrapeExpiredDomains() {
  const results = [];
  const BATCH = 40;

  for (let i = 0; i < BATCH; i++) {
    const domain = WORDLIST[(scanIndex + i) % WORDLIST.length];
    try {
      if (await isDomainExpired(domain))
        results.push({ domain, bl: 0, aby: 0, acr: 0, source: 'wordlist', niche: guessNiche(domain) });
    } catch (e) { console.error(`RDAP[${domain}]:`, e.message); }
    await new Promise(r => setTimeout(r, 300));
  }
  scanIndex = (scanIndex + BATCH) % WORDLIST.length;
  console.log(`scrapeExpiredDomains: ${results.length} expired found`);
  return results;
}

export async function debugScrape() {
  const samples = WORDLIST.slice(0, 8);
  const lines = [];
  for (const domain of samples) {
    try {
      const expired = await isDomainExpired(domain);
      lines.push(`${domain}: ${expired ? 'истёк/свободен ✅' : 'зарегистрирован ❌'}`);
    } catch (e) {
      lines.push(`${domain}: ошибка`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return lines;
}
