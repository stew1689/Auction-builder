import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHendersonService} from './henderson.js';
import {createCatalogImporter} from './catalog.js';

const routes = {'/': 'index.html', '/app.js': 'app.js', '/model.js': 'model.js', '/style.css': 'style.css'};
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css'};
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
export function createApp(service = createHendersonService(), importCatalog = createCatalogImporter()) {
  return http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {...securityHeaders, Allow: 'GET, HEAD'});
      return res.end();
    }
    const json = (status, data) => {
      res.writeHead(status, {...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
    };
    if (path === '/api/henderson/auctions') {
      try { return json(200, await service.directory()); }
      catch (error) { return json(502, {error: error.message}); }
    }
    const lotRoute = path.match(/^\/api\/henderson\/auctions\/(\d{1,10})\/lots$/);
    if (lotRoute) {
      try { return json(200, await importCatalog('https://bid.hendersonauctions.com/ui/auctions/'+lotRoute[1])); }
      catch (error) { return json(502, {error: error.message}); }
    }
    const catalog = path.match(/^\/api\/henderson\/auctions\/(\d+)\/catalog$/);
    if (catalog) {
      try { return json(200, await service.catalog(catalog[1])); }
      catch (error) { return json(error.code === 'NOT_FOUND' ? 404 : 502, {error: error.message}); }
    }
    const file = routes[path];
    if (!file) { res.writeHead(404, securityHeaders); return res.end('Not found'); }
    try {
      const data = await readFile(new URL('./public/' + file, import.meta.url));
      res.writeHead(200, {...securityHeaders, 'Content-Type': types[file.split('.').pop()] + '; charset=utf-8'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(500, securityHeaders); res.end('Unable to load application'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '0.0.0.0', () => console.log('Auction Builder listening on port ' + port));
}
