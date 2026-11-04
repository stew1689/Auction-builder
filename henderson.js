import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {load} from 'cheerio';

const execFileAsync = promisify(execFile);
export const sourceUrl = 'https://www.hendersonauctions.com/';
const allowedHosts = new Set(['hendersonauctions.com', 'www.hendersonauctions.com', 'bid.hendersonauctions.com']);

export function safeSourceUrl(value, host) {
  try {
    const url = new URL(value, sourceUrl);
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (host && url.hostname !== host) return null;
    return url.href;
  } catch { return null; }
}

export async function fetchPage(value) {
  const url = safeSourceUrl(value);
  if (!url) throw new Error('Unsupported auction source URL.');
  // curl preserves the managed HTTPS proxy and CA configuration. Redirects are
  // deliberately not followed: every network destination must be approved.
  try {
    const {stdout} = await execFileAsync('curl', [
      '--silent', '--show-error', '--fail', '--max-time', '20',
      '--max-filesize', '3000000', '--proto', '=https',
      '--user-agent', 'AuctionBuilder/1.0 (personal auction research)',
      '--write-out', '\n%{http_code}:%{http_connect}', url,
    ], {maxBuffer: 3100000, timeout: 23000});
    const split = stdout.lastIndexOf('\n');
    const status = Number(stdout.slice(split + 1).split(':')[0]);
    if (status !== 200) throw new Error('Source returned HTTP ' + status + '.');
    return stdout.slice(0, split);
  } catch (error) {
    if (/CONNECT tunnel failed, response 403/.test(error.stderr || '') || /\n\d{3}:403$/.test(error.stdout || '')) {
      const blocked = new Error('Network access to ' + new URL(url).hostname + ' is blocked. Enable this hostname in environment settings, then retry.');
      blocked.code = 'NETWORK_BLOCKED';
      throw blocked;
    }
    if (error.code === 'NETWORK_BLOCKED') throw error;
    throw new Error('Could not retrieve ' + new URL(url).hostname + '. The source may be unavailable or rejecting requests; retry later.');
  }
}

export function parseAuctions(html) {
  const $ = load(html);
  const auctions = [];
  const seen = new Set();
  $('.auction-item').each((_, element) => {
    const card = $(element);
    const titleLink = card.find('.auction-title a').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const detailUrl = safeSourceUrl(titleLink.attr('href'));
    const catalogUrl = card.find('a[href]').toArray().map(a => safeSourceUrl($(a).attr('href'), 'bid.hendersonauctions.com')).find(Boolean);
    const id = catalogUrl && new URL(catalogUrl).pathname.match(/^\/ui\/auctions\/(\d+)(?:\/\d+)?\/?$/)?.[1];
    if (!title || !detailUrl || !id || seen.has(id)) return;
    seen.add(id);
    const info = card.find('.auction-information li').toArray().map(li => $(li).text().replace(/\s+/g, ' ').trim());
    const field = prefix => info.find(s => s.startsWith(prefix))?.slice(prefix.length).replace(/^\s*:\s*/, '').trim() || '';
    auctions.push({id, title, detailUrl, catalogUrl,
      dates: field('Auction Dates'), location: field('Location'), preview: field('Preview')});
  });
  if (!auctions.length) throw new Error('No auction cards were found. Henderson may have changed its page format; no example data was substituted.');
  return auctions;
}

export function createHendersonService(fetcher = fetchPage, clock = () => Date.now()) {
  let cache;
  let pending;
  const catalogChecks = new Map();
  async function directory() {
    if (cache && clock() - cache.time < 5 * 60 * 1000) return cache.data;
    if (pending) return pending;
    pending = (async () => {
      const auctions = parseAuctions(await fetcher(sourceUrl));
      const data = {sourceUrl, fetchedAt: new Date(clock()).toISOString(), auctions,
        note: 'Auction metadata from Henderson’s homepage. Verify dates on the source; homepage entries may include past sales. Individual lots and bids are not imported.'};
      cache = {time: clock(), data};
      return data;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  async function catalog(id) {
    const {auctions} = await directory();
    const auction = auctions.find(a => a.id === id);
    if (!auction) {
      const error = new Error('Select an auction from the current Henderson directory.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    const cached = catalogChecks.get(id);
    if (cached && clock() - cached.time < 60000) return cached.data;
    let data;
    try {
      await fetcher(auction.catalogUrl);
      data = {status: 'reachable', message: 'Catalog page is reachable. Use Analyze lots to import its public items.', catalogUrl: auction.catalogUrl};
    } catch (error) {
      data = {status: error.code === 'NETWORK_BLOCKED' ? 'network_blocked' : 'unavailable', message: error.message, catalogUrl: auction.catalogUrl};
    }
    data.checkedAt = new Date(clock()).toISOString();
    catalogChecks.set(id, {time: clock(), data});
    return data;
  }
  return {directory, catalog};
}
