import {load} from 'cheerio';
import {fetchPage, safeSourceUrl} from './henderson.js';

export function catalogId(value) {
  const url = safeSourceUrl(value, 'bid.hendersonauctions.com');
  const match = url && new URL(url).pathname.match(/^\/ui\/auctions\/(\d{1,10})\/?$/);
  if (!match) throw new Error('Paste a Henderson auction catalog URL, such as https://bid.hendersonauctions.com/ui/auctions/171118.');
  return match[1];
}
const clean = value => value.replace(/\s+/g, ' ').trim();
function lotUrl(value) {
  try { return safeSourceUrl(new URL(value, 'https://bid.hendersonauctions.com').href, 'bid.hendersonauctions.com'); } catch { return null; }
}
function price(text) {
  const match = text.match(/(High bid|Starting at|Sold for)\s*\$([\d,]+(?:\.\d{1,2})?)/i);
  return match ? {amount: Number(match[2].replaceAll(',', '')), kind: match[1].toLowerCase()} : {amount: null, kind: 'not published'};
}
function item(id, url, label, text) {
  const match = clean(label).match(/^#(.+?)\s*•\s*(.+)$/);
  if (!match) return null;
  const sourcePrice = price(text);
  return {sourceId: new URL(url).pathname.split('/').pop(), auctionId: id, lotNumber: match[1], title: match[2].slice(0,200), url,
    sourceAmount: sourcePrice.amount, sourcePriceKind: sourcePrice.kind,
    placeholder: /LOTS? COMING SOON|CONSIGNMENTS ACCEPTED/i.test(match[2])};
}
export function parseCatalog(html, id) {
  const $ = load(html);
  const items = new Map();
  $('li a[href]').each((_, a) => {
    const url = lotUrl($(a).attr('href'));
    if (!url || !new RegExp('^/ui/auctions/'+id+'/\\d+/?$').test(new URL(url).pathname)) return;
    const lot = item(id, url, $(a).text(), $(a).closest('li').text());
    if (lot) items.set(lot.sourceId, lot);
  });
  if (!items.size) throw new Error('No public lots found in this catalog. The sale may not be published or its page format has changed.');
  const total = $('body').text().match(/Showing the first\s+\d+\s+of\s+([\d,]+)\s+lots/i);
  const event = $('script[type="application/ld+json"]').toArray().map(e => {try {return JSON.parse($(e).text());}catch{return null;}}).find(j => j?.['@type'] === 'Event');
  return {title: event?.name || clean($('title').text()), startDate: event?.startDate || null,
    total: total ? Number(total[1].replaceAll(',','')) : null, items: [...items.values()]};
}
export function sitemapUrls(xml, id) {
  const $ = load(xml, {xmlMode: true});
  return [...new Set($('loc').toArray().map(e => safeSourceUrl($(e).text().trim(), 'bid.hendersonauctions.com')).filter(url => url && new RegExp('^/ui/auctions/'+id+'/\\d+/?$').test(new URL(url).pathname)))];
}
export function parseLot(html, id, url) {
  const $ = load(html);
  const lot = item(id, url, $('h1').first().text(), $('h1').first().parent().text());
  if (!lot) throw new Error('Lot title missing.');
  return lot;
}
export function createCatalogImporter(fetcher = fetchPage, clock = () => Date.now()) {
  const cache = new Map(), pending = new Map();
  async function run(id) {
    const deadline = clock() + 55000;
    const sourceUrl = 'https://bid.hendersonauctions.com/ui/auctions/'+id;
    const parsed = parseCatalog(await fetcher(sourceUrl), id);
    const found = new Map(parsed.items.map(l => [l.sourceId,l]));
    const warnings = [];
    let expected = parsed.total;
    if (expected === null || found.size < expected) {
      try {
        const urls = sitemapUrls(await fetcher('https://bid.hendersonauctions.com/sitemaps/lots/'+id+'.xml'), id);
        if (urls.length) expected = Math.max(expected || 0, urls.length);
        const missing = urls.filter(url => !found.has(new URL(url).pathname.split('/').pop()));
        const remaining = missing.slice(0,200);
        if (missing.length > remaining.length) warnings.push('Only 200 additional lot pages are fetched per import.');
        let failed = 0;
        async function worker() {
          while (remaining.length && clock() < deadline) {
            const url = remaining.shift();
            try {const lot = parseLot(await fetcher(url), id, url); found.set(lot.sourceId,lot);} catch {failed++;}
          }
        }
        await Promise.all([worker(),worker(),worker()]);
        if (failed || remaining.length) warnings.push(`${failed + remaining.length} additional lot pages could not be retrieved during this import.`);
      } catch {warnings.push('The lot sitemap could not be read; coverage may be incomplete.');}
    }
    const all = [...found.values()];
    const lots = all.filter(l => !l.placeholder).map(({placeholder,...l}) => l);
    const skipped = all.length - lots.length;
    const complete = expected !== null && all.length >= expected;
    if (!complete) warnings.push('This is a partial catalog. Items not retrieved are not included in rankings.');
    const result = {auctionId:id, title:parsed.title, startDate:parsed.startDate, sourceUrl,
      fetchedAt:new Date(clock()).toISOString(), total:expected, retrieved:all.length, skipped, complete, warnings, lots};
    if (cache.size >= 20) cache.delete(cache.keys().next().value);
    cache.set(id,{time:clock(),result});
    return result;
  }
  return async value => {
    const id = catalogId(value);
    const cached = cache.get(id);
    if (cached && clock()-cached.time<300000) return cached.result;
    if (pending.has(id)) return pending.get(id);
    if (pending.size >= 2) throw new Error('Two auctions are already loading. Please retry shortly.');
    const request = run(id);
    pending.set(id,request);
    try {return await request;} finally {pending.delete(id);}
  };
}
