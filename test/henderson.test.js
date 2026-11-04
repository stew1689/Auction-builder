import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAuctions, safeSourceUrl, createHendersonService} from '../henderson.js';
import {createApp} from '../server.js';

const fixture = `<div class="auction-item"><h2 class="auction-title"><a href="https://www.hendersonauctions.com/auction/surplus/">Equipment &amp; tools</a></h2><div class="auction-information"><ul><li><span>Auction Dates :</span> November 12, 2026 | 11am</li><li><span>Location :</span> New Orleans, LA</li><li><span>Preview :</span> November 10</li></ul></div><a href="https://bid.hendersonauctions.com/ui/auctions/172480?category=All&amp;subCategory=Active">Catalog</a></div>`;

test('extracts auction metadata without turning auctions into lots', () => {
 const result = parseAuctions(fixture + fixture);
 assert.equal(result.length, 1);
 assert.deepEqual(result[0], {id:'172480',title:'Equipment & tools',detailUrl:'https://www.hendersonauctions.com/auction/surplus/',catalogUrl:'https://bid.hendersonauctions.com/ui/auctions/172480?category=All&subCategory=Active',dates:'November 12, 2026 | 11am',location:'New Orleans, LA',preview:'November 10'});
 assert.equal(result[0].bid, undefined);
});
test('rejects arbitrary destinations, credentials, protocols, and ports', () => {
 for (const url of ['https://evil.example/','http://www.hendersonauctions.com/','https://user:pass@www.hendersonauctions.com/','https://www.hendersonauctions.com:8000/','https://bid.hendersonauctions.com.evil.example/']) assert.equal(safeSourceUrl(url), null);
 assert.equal(safeSourceUrl('/auction/test/'),'https://www.hendersonauctions.com/auction/test/');
});
test('changed or empty source fails explicitly without substituting examples', () => {
 assert.throws(() => parseAuctions('<html>No auctions</html>'), /No auction cards/);
 assert.throws(() => parseAuctions(fixture.replace('bid.hendersonauctions.com','evil.example')), /No auction cards/);
});
test('directory coalesces requests, caches, and refreshes after expiry', async () => {
 let calls = 0, time = 0;
 const service = createHendersonService(async () => { calls++; return fixture; }, () => time);
 await Promise.all([service.directory(),service.directory()]);
 assert.equal(calls,1);
 await service.directory(); assert.equal(calls,1);
 time = 300001; await service.directory(); assert.equal(calls,2);
});
test('catalog access reports blocked separately from reachable', async () => {
 const service = createHendersonService(async url => {
  if (url.includes('bid.')) {const error = new Error('Network blocked'); error.code='NETWORK_BLOCKED'; throw error;}
  return fixture;
 });
 const result = await service.catalog('172480');
 assert.equal(result.status,'network_blocked'); assert.equal(result.lots,undefined);
 await assert.rejects(service.catalog('9999'), /Select an auction/);
 const reachable = createHendersonService(async url => url.includes('bid.')?'<html>Catalog app</html>':fixture);
 assert.equal((await reachable.catalog('172480')).status,'reachable');
});
test('source failure is not cached as a successful response', async () => {
 let attempt=0;
 const service = createHendersonService(async()=>{if(!attempt++)throw Error('offline');return fixture;});
 await assert.rejects(service.directory(),/offline/);
 assert.equal((await service.directory()).auctions.length,1);
});
test('HTTP API exposes directory and access status, rejects unknown IDs and methods', async () => {
 const service = createHendersonService(async url => {if(url.includes('bid.'))throw Error('Unavailable');return fixture;});
 const server = createApp(service);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const base='http://127.0.0.1:'+server.address().port;
  const directory=await fetch(base+'/api/henderson/auctions');
  assert.equal(directory.status,200);assert.equal((await directory.json()).auctions.length,1);
  assert.equal((await (await fetch(base+'/api/henderson/auctions/172480/catalog')).json()).status,'unavailable');
  assert.equal((await fetch(base+'/api/henderson/auctions/9999/catalog')).status,404);
  assert.equal((await fetch(base+'/api/henderson/auctions',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/api/henderson/auctions?url=http://localhost')).status,200);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
