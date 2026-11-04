# Auction Builder

A local-first resale research dashboard for evaluating auction lots for New Orleans Marketplace pickup, eBay shipping, and Marketplace shipping.

## Run

Requires Node.js 22 or later, npm, and curl. Install the locked dependencies before starting.

```sh
npm ci --ignore-scripts
npm start
```

The server listens on port 3000 (override with `PORT`). `npm run dev` restarts the server on changes. Run calculation tests with `node test/model.test.js`, connector/API tests with `node test/henderson.test.js`, catalog import tests with `node test/catalog.test.js`, or all tests with `npm test`. API tests bind a temporary loopback port.

## Import a Henderson auction

1. Click **Analyze auction** in the header (or **Analyze lots** on a Henderson directory card).
2. Paste a catalog URL such as `https://bid.hendersonauctions.com/ui/auctions/171118`.
3. Click **Import auction lots**. Close the dialog when the coverage report appears.
4. Review the imported items, then open an item and choose **Edit estimates** to add resale value, collection, repairs, and any shipping costs. Verify buyer premiums and taxes in Buying preferences.

The importer reads public catalog HTML and its public auction-specific lot sitemap. It imports lot titles, lot numbers, links, and source price snapshots, preserving **high bid** versus **starting at** labels. Two “lots coming soon” announcements were excluded when validating auction 171118: all 150 source entries were retrieved and 148 actual lot records were imported. This is a validation snapshot, not a guarantee that the catalog or bids will stay unchanged.

Catalog imports are cached for five minutes and duplicate requests share the same work. Up to two auctions can be importing at once. Supplemental lot-page fetches run with three workers, at most 200 additional pages, and a time budget; coverage is explicitly marked partial if any lots are missing. If the public page format changes, the importer fails rather than substituting examples. Redirects are not followed. Failed extra pages produce warnings instead of a false completeness claim.

Refreshing an existing imported lot updates source-price metadata and its timestamp, preserving the user's planned purchase price, estimates, notes, and watchlist. Source prices may rise above the planned price; this is flagged in the table. The source filter defaults to the imported auction, keeping example lots separate. Resale values are not scraped or invented: unvalued items show **Needs resale estimate**, are excluded from estimated profit totals and local-pickup counts, and sort behind evaluated items in profit/margin rankings.

**Research fit** is a title-keyword triage rule, not an estimate of resale likelihood. It prioritizes tools/accessories for research, flags heavy equipment for capital/transport review, and flags parts/repairs or missing-title items for inspection. Shipping suitability is not inferred; set it after checking the item. Collection, repair, and shipping costs initially default to zero and must be researched. A $1 opening bid does not establish that heavy equipment is affordable or profitable.

## Live Henderson directory

Click **Henderson auctions** in the header/sidebar to retrieve actual auction titles, dates, pickup locations, preview details, and source links from Henderson’s homepage. Homepage entries can include past sales and stale titles, so verify dates against the catalog. The source's structured start date may describe the opening of bidding, not the live auction date. The directory caches for five minutes and catalog reachability checks for one minute.

Server endpoints:

- `GET /api/henderson/auctions`: auction directory.
- `GET /api/henderson/auctions/:id/catalog`: reachability check for a directory-listed auction.
- `GET /api/henderson/auctions/:id/lots`: catalog import for an explicit numeric Henderson auction ID, independent of homepage membership.

Fetches use curl with the inherited proxy and TLS trust, strict HTTPS host validation, no redirects, 20-second per-request timeouts, and a 3 MB response limit. No arbitrary URL proxy, bidder login, or bidding action is exposed. No sold-price lookup is included.

## Features

- Sort by net profit, net margin, or manually assessed resale demand; filter by category, recommended channel, and total acquisition budget.
- Edit buyer premium, sales tax, selling fees, target margin, and investment limit.
- Compare net proceeds by channel, with local pickup preferred within 10% of the highest proceeds.
- Calculate maximum hammer bids constrained by both target margin and investment budget.
- Add/edit/delete lots, save a watchlist, and import/export JSON. Download a JSON template from the import dialog.
- Browser-local persistence. No account, shared database, or server-side user storage; exports contain lots, not preferences or watchlist state.

## Evidence and limitations

The starting lots, prices, and demand ratings are illustrative examples, not actual Henderson listings. The live auction directory is connected and was validated against 10 actual homepage entries. Actual item imports are implemented as described above. Sold-price integration is not implemented; profit estimates still need user-entered resale values and costs.

All resale prices, demand assessments, and comparable-sale counts are user-supplied. A count of three sold comparisons labels evidence “Supported,” but the application does not independently verify those comparisons. Record sources in lot notes. No numerical sale probability or time-to-sell is predicted.

Default auction premium (15%), sales tax (10%), and Marketplace shipping fee (10%) are editable planning placeholders, not verified auction/platform terms. eBay defaults to the user's approximate 14%; actual category fees, per-order charges, and other costs can differ. Marketplace shipping availability must be verified. Tax is modeled on hammer plus premium; exemption and auction-specific tax rules are not modeled. The shipped sale price should include buyer-paid shipping, and shipping expense should include full postage and packaging. Profit excludes personal labor, storage, and income taxes unless included in preparation costs.

## Deployment

Serve with `npm start` behind a trusted HTTPS reverse proxy. This is a personal research MVP; browser data does not synchronize between devices. The server exposes four application assets and the three restricted Henderson endpoints described above. It does not place bids or access bidder accounts.

For the existing Render service, deploy the latest `render-deploy` branch commit with **Manual Deploy → Deploy latest commit**. The Blueprint disables automatic deployment; pushing code does not establish that Render has deployed it. No new environment publication is needed to deploy a repository update on Render.
