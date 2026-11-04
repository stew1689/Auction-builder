export const defaults={premium:15,tax:10,ebay:14,marketplace:10,target:30,budget:2000};
export function analyze(lot,s){
 const acquisition=lot.bid*(1+s.premium/100)*(1+s.tax/100)+lot.transport+lot.repair;
 const channels=[{name:'Local pickup',net:lot.local,fee:0,cost:0}];
 if(lot.shippable){channels.push({name:'eBay',net:lot.shipped*(1-s.ebay/100)-lot.shipping,fee:lot.shipped*s.ebay/100,cost:lot.shipping},{name:'Marketplace shipping',net:lot.shipped*(1-s.marketplace/100)-lot.shipping,fee:lot.shipped*s.marketplace/100,cost:lot.shipping});}
 channels.forEach(c=>{c.profit=c.net-acquisition;c.margin=c.net>0?100*c.profit/c.net:0;});
 const best=channels.reduce((a,b)=>b.net>a.net?b:a);
 // Favor pickup when it retains at least 90% of the best net proceeds.
 const channel=channels[0].net>=best.net*.9?channels[0]:best;
 const multiplier=(1+s.premium/100)*(1+s.tax/100);
 const maxBid=Math.max(0,Math.min(channel.net*(1-s.target/100),s.budget)-lot.transport-lot.repair)/multiplier;
 return {hasValuation:lot.local>0||(lot.shippable&&lot.shipped>0),acquisition,channels,channel,maxBid,withinBudget:acquisition<=s.budget,evidence:lot.comps>=3?'Supported':lot.comps>0?'Limited':'Unverified'};
}
export function validateLot(x){
 if(!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>200)throw Error('Every lot needs a title of 1–200 characters.');
 for(const key of ['bid','local','shipped','transport','repair','shipping','comps'])if(typeof x[key]!=='number'||!Number.isFinite(x[key])||x[key]<0||x[key]>10000000)throw Error('Lot field '+key+' must be a nonnegative number.');
 if(!['High','Medium','Low','Unknown'].includes(x.demand))throw Error('Demand must be High, Medium, Low, or Unknown.');
 if(typeof x.shippable!=='boolean')throw Error('Shippable must be true or false.');
 if(x.url){const u=new URL(x.url);if(!['https:','http:'].includes(u.protocol))throw Error('Source URL must use HTTP or HTTPS.');}
 return {...x,title:x.title.trim(),category:String(x.category||'Other').slice(0,60),notes:String(x.notes||'').slice(0,2000)};
}
export const examples=[
 {id:'demo1',title:'Commercial stainless prep table',category:'Restaurant',bid:175,local:575,shipped:0,transport:65,repair:25,shipping:0,comps:0,demand:'High',shippable:false,icon:'▤',notes:'Illustrative only. Inspect welds, dimensions, and NSF markings.'},
 {id:'demo2',title:'DeWalt cordless tool bundle',category:'Tools',bid:220,local:480,shipped:560,transport:25,repair:20,shipping:38,comps:0,demand:'High',shippable:true,icon:'⚒',notes:'Illustrative only. Verify model numbers, battery health, and operation.'},
 {id:'demo3',title:'Herman Miller office chair',category:'Furniture',bid:150,local:450,shipped:620,transport:45,repair:35,shipping:125,comps:0,demand:'Medium',shippable:true,icon:'▥',notes:'Illustrative only. Verify brand, size, mechanisms, and upholstery.'},
 {id:'demo4',title:'Portable inverter generator',category:'Equipment',bid:650,local:1250,shipped:0,transport:65,repair:100,shipping:0,comps:0,demand:'High',shippable:false,icon:'▣',notes:'Illustrative only. Load test and confirm service history.'},
 {id:'demo5',title:'Vintage stereo receiver',category:'Electronics',bid:120,local:290,shipped:450,transport:20,repair:40,shipping:45,comps:0,demand:'Medium',shippable:true,icon:'▦',notes:'Illustrative only. Test all inputs and confirm exact model.'},
 {id:'demo6',title:'Zero-turn riding mower',category:'Equipment',bid:1700,local:2900,shipped:0,transport:180,repair:250,shipping:0,comps:0,demand:'Medium',shippable:false,icon:'▧',notes:'Illustrative only. Inspect deck, hours, hydraulics, and engine.'}
].map(x=>({...x,demo:true,url:''}));

// A research triage rule based on title keywords, not a measured sale probability.
export function researchFit(title) {
 if (/parts|repairs|no title|salvage/i.test(title)) return {score:0,label:'Inspect first',category:'Condition risk',reason:'Title flags parts/repairs or missing ownership documents.'};
 if (/excavator|dozer|dump truck|rotary mixer|crawler|off-highway|scraper|new holland|skid steer|compactor/i.test(title)) return {score:1,label:'Budget caution',category:'Heavy equipment',reason:'Heavy equipment can require substantial capital and transport. A low opening bid is not its likely final cost.'};
 if (/dewalt|milwaukee|blue point|ingersoll|tool|cord|charger|screwdriv|hole saw|jumper cable|light|packout/i.test(title)) return {score:3,label:'Research first',category:'Tools & accessories',reason:'Title suggests tools or accessories that may fit your smaller-item workflow. Verify model, completeness, condition, and sold comparisons.'};
 return {score:2,label:'Review locally',category:'Other',reason:'Check local buyer demand, collection logistics, and exact item condition before estimating resale.'};
}
export function mergeCatalogLots(existing, catalog) {
 const byUrl = new Map(existing.filter(l=>l.url).map(l=>[l.url,l]));
 let added=0,updated=0;
 const result=[...existing];
 for (const source of catalog.lots) {
  const metadata={auctionId:catalog.auctionId,sourceId:source.sourceId,lotNumber:source.lotNumber,sourceAmount:source.sourceAmount,sourcePriceKind:source.sourcePriceKind,sourceFetchedAt:catalog.fetchedAt,auctionStartDate:catalog.startDate};
  const previous=byUrl.get(source.url);
  if(previous){Object.assign(previous,metadata);updated++;continue;}
  const fit=researchFit(source.title);
  const lot={...metadata,id:'henderson-'+catalog.auctionId+'-'+source.sourceId,title:source.title,url:source.url,category:fit.category,bid:source.sourceAmount??0,local:0,shipped:0,transport:0,repair:0,shipping:0,comps:0,demand:'Unknown',shippable:false,demo:false,notes:'Imported from '+catalog.title+'. Costs and resale value need research. '+fit.reason};
  result.push(lot);byUrl.set(lot.url,lot);added++;
 }
 return {lots:result,added,updated};
}
