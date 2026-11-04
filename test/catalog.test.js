import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogId,parseCatalog,parseLot,sitemapUrls,createCatalogImporter} from '../catalog.js';
import {mergeCatalogLots,analyze,defaults,researchFit} from '../public/model.js';
import {createApp} from '../server.js';
const base='https://bid.hendersonauctions.com';
const url=base+'/ui/auctions/171118';
const html=`<title>Contractor auction</title><script type="application/ld+json">{"@type":"Event","name":"Contractor auction","startDate":"2026-12-09"}</script><ul><li><a href="/ui/auctions/171118/100">#A1 • DeWalt drill &amp; charger</a> (High bid $1,250.00)</li><li><a href="/ui/auctions/171118/101">#2 • LOTS COMING SOON!!!</a> (Starting at $1.00)</li><li><a href="https://evil.example/ui/auctions/171118/102">#3 • Foreign link</a></li><li><a href="https://[invalid">invalid</a></li></ul><p>Showing the first 2 of 3 lots.</p>`;
const xml=`<urlset><url><loc>${url}/100</loc></url><url><loc>${url}/101</loc></url><url><loc>${url}/102</loc></url><url><loc>https://evil.example/ui/auctions/171118/103</loc></url></urlset>`;
const product='<div><h1>#A2 • Truck tool box</h1><p>Starting at $5.00</p><p>Status: Available</p></div>';
function fakeFetch(u){return Promise.resolve(u.endsWith('.xml')?xml:u.endsWith('/102')?product:html);}
test('catalog URL accepts only the public HTTPS Henderson catalog path',()=>{
 assert.equal(catalogId(url+'?category=All'),'171118');
 for(const u of ['http://bid.hendersonauctions.com/ui/auctions/171118',url+'/100','https://evil.example/ui/auctions/1','https://user@bid.hendersonauctions.com/ui/auctions/1',base+':444/ui/auctions/1',base+'/accounts'])assert.throws(()=>catalogId(u));
});
test('catalog parser preserves labels, price types and unknown values',()=>{
 const p=parseCatalog(html,'171118');assert.equal(p.total,3);assert.equal(p.items.length,2);
 assert.equal(p.items[0].sourceAmount,1250);assert.equal(p.items[0].title,'DeWalt drill & charger');assert.equal(p.items[0].sourcePriceKind,'high bid');assert.equal(p.items[1].placeholder,true);
 const l=parseLot('<h1>#X • Unknown cost item</h1>','171118',url+'/102');assert.equal(l.sourceAmount,null);
 assert.equal(parseLot(product,'171118',url+'/102').sourcePriceKind,'starting at');
 assert.throws(()=>parseCatalog('<html>Changed</html>','171118'),/No public lots/);
});
test('sitemap filtering rejects foreign hosts and other auctions',()=>{
 assert.equal(sitemapUrls(xml+'<loc>'+base+'/ui/auctions/999/1</loc>','171118').length,3);
});
test('importer retrieves sitemap-only lots, excludes placeholders and caches',async()=>{
 let calls=0;
 const service=createCatalogImporter(async u=>{calls++;return fakeFetch(u);});
 const [result,same]=await Promise.all([service(url),service(url)]);
 assert.equal(result,same);assert.equal(result.complete,true);assert.equal(result.retrieved,3);assert.equal(result.skipped,1);assert.equal(result.lots.length,2);assert.equal(calls,3);
 await service(url);assert.equal(calls,3);
});
test('failed extra pages produce explicit partial coverage',async()=>{
 const service=createCatalogImporter(async u=>{if(u.endsWith('/102'))throw Error('offline');return fakeFetch(u);});
 const result=await service(url);assert.equal(result.complete,false);assert.equal(result.retrieved,2);assert.ok(result.warnings.length>0);
});
test('import merge deduplicates, preserves user estimates, and never invents resale value',async()=>{
 const result=await createCatalogImporter(fakeFetch)(url);
 const first=mergeCatalogLots([],result);assert.equal(first.added,2);assert.equal(first.lots[0].demand,'Unknown');assert.equal(analyze(first.lots[0],defaults).hasValuation,false);
 first.lots[0].local=2000;first.lots[0].bid=400;first.lots[0].notes='My comps';
 const refreshed=structuredClone(result);refreshed.lots[0].sourceAmount=1500;
 const second=mergeCatalogLots(first.lots,refreshed);
 assert.equal(second.added,0);assert.equal(second.updated,2);assert.equal(second.lots.length,2);assert.equal(second.lots[0].local,2000);assert.equal(second.lots[0].bid,400);assert.equal(second.lots[0].sourceAmount,1500);assert.equal(second.lots[0].notes,'My comps');
});
test('research triage separates tool fit from heavy-equipment and repair risks',()=>{
 assert.ok(researchFit('DeWalt drill').score>researchFit('CATERPILLAR Excavator').score);
 assert.equal(researchFit('Pickup FOR PARTS/REPAIRS').score,0);
});
test('lot API retrieves supplied auction independently of homepage membership',async()=>{
 const server=createApp(undefined,createCatalogImporter(fakeFetch));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/henderson/auctions/171118/lots');assert.equal(response.status,200);assert.equal((await response.json()).lots.length,2);}finally{await new Promise(resolve=>server.close(resolve));}
});
