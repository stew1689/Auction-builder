# Auction Builder

A local-first resale research dashboard for evaluating auction lots for New Orleans Marketplace pickup, eBay shipping, and Marketplace shipping.

## Run

Requires Node.js 22 or later, npm, and curl. Install the locked dependencies before starting.

```sh
npm ci --ignore-scripts
npm start
```

The server listens on port 3000 (override with `PORT`). `npm run dev` restarts the server on changes. Run calculation tests with `node test/model.test.js`, connector/API tests with `node test/henderson.test.js`, or all tests with `npm test`. API tests bind a temporary loopback port.

## Live Henderson directory

Click **Henderson auctions** in the header or sidebar. The app retrieves actual auction titles, dates, pickup locations, preview details, and catalog links from Henderson’s homepage. This is an auction directory, not an individual-lot importer. Homepage entries can include past sales; verify the displayed dates on the source. The server caches successful directory responses for five minutes and catalog status for one minute.

Use **Check lot connection** on an auction to check catalog reachability. **Open catalog** opens the original catalog; **Add a researched lot** opens manual item entry with auction context filled in. This action does not import an actual item or bid amount. Existing example lots remain clearly labeled and separate from the live directory.

The catalog host `bid.hendersonauctions.com` is currently denied by the managed network proxy. Its requirement is saved in the environment draft. Apply that environment setting and retry; automatic extraction still needs investigation of the actual catalog data after access is available. A reachable HTML page alone is reported as “needs adapter,” never as imported lots. No sold-price lookup is included.

Server endpoints: `GET /api/henderson/auctions` and `GET /api/henderson/auctions/:id/catalog`. Catalog IDs must appear in the source directory. Fetches use curl with the inherited proxy and TLS trust, strict HTTPS host validation, no redirects, 20-second timeouts, and a 3 MB response limit. No arbitrary URL proxy is exposed.

## Features

- Sort by net profit, net margin, or manually assessed resale demand; filter by category, recommended channel, and total acquisition budget.
- Edit buyer premium, sales tax, selling fees, target margin, and investment limit.
- Compare net proceeds by channel, with local pickup preferred within 10% of the highest proceeds.
- Calculate maximum hammer bids constrained by both target margin and investment budget.
- Add/edit/delete lots, save a watchlist, and import/export JSON. Download a JSON template from the import dialog.
- Browser-local persistence. No account, shared database, or server-side user storage; exports contain lots, not preferences or watchlist state.

## Evidence and limitations

The starting lots, prices, and demand ratings are illustrative examples, not actual Henderson listings. The live auction directory is connected and was validated against 10 actual homepage entries. Individual lot extraction and sold-price integration are not yet implemented because the separate bidding host remains blocked; see the directory section above.

All resale prices, demand assessments, and comparable-sale counts are user-supplied. A count of three sold comparisons labels evidence “Supported,” but the application does not independently verify those comparisons. Record sources in lot notes. No numerical sale probability or time-to-sell is predicted.

Default auction premium (15%), sales tax (10%), and Marketplace shipping fee (10%) are editable planning placeholders, not verified auction/platform terms. eBay defaults to the user's approximate 14%; actual category fees, per-order charges, and other costs can differ. Marketplace shipping availability must be verified. Tax is modeled on hammer plus premium; exemption and auction-specific tax rules are not modeled. The shipped sale price should include buyer-paid shipping, and shipping expense should include full postage and packaging. Profit excludes personal labor, storage, and income taxes unless included in preparation costs.

## Deployment

Serve with `npm start` behind a trusted HTTPS reverse proxy. This is a personal research MVP; browser data does not synchronize between devices. The server exposes four application assets and the two restricted Henderson metadata/status endpoints described above. It does not place bids or access bidder accounts.
