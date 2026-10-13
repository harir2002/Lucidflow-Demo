const https = require('https');
const http = require('http');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'IRDAI-Local-Scanner/1.0' }, timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function extractLocs(xml) {
  const locs = [], re = /<loc>\s*(.*?)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) locs.push(m[1].trim());
  return locs;
}

const SKIP = [/\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip|doc|xls)$/i, /\/assets\//i, /\?.*utm/i];
function skip(url) { return SKIP.some(p => p.test(url)); }

async function parseSitemap(url, visited = new Set(), depth = 0) {
  if (depth > 5 || visited.has(url)) return [];
  visited.add(url);
  let xml;
  try { xml = await fetchUrl(url); } catch { return []; }
  const locs = extractLocs(xml);
  const pages = [], children = [];
  for (const loc of locs) {
    if (/sitemap.*\.xml/i.test(loc)) children.push(loc);
    else if (!skip(loc)) pages.push(loc);
  }
  for (const child of children) pages.push(...await parseSitemap(child, visited, depth + 1));
  return pages;
}

async function discoverAllUrls(baseUrl, onProgress) {
  if (onProgress) onProgress('Checking robots.txt and sitemap.xml...');
  const sitemapUrls = [];

  try {
    const robots = await fetchUrl(new URL('/robots.txt', baseUrl).href);
    (robots.match(/^Sitemap:\s*(.+)$/gim) || []).forEach(m => {
      const u = m.replace(/^Sitemap:\s*/i, '').trim();
      if (u) sitemapUrls.push(u);
    });
  } catch {}

  for (const p of ['/sitemap.xml', '/sitemap_index.xml']) {
    try {
      const u = new URL(p, baseUrl).href;
      const c = await fetchUrl(u);
      if ((c.includes('<loc>') || c.includes('<urlset')) && !sitemapUrls.includes(u)) sitemapUrls.push(u);
    } catch {}
  }

  if (!sitemapUrls.length) return { urls: [], sitemapFound: false };

  const all = [];
  const visited = new Set();
  for (const s of sitemapUrls) all.push(...await parseSitemap(s, visited));
  return { urls: [...new Set(all)], sitemapFound: true };
}

function scoreUrl(url) {
  const p = url.toLowerCase();
  if (/quote|checkout|payment|quote-details/.test(p)) return 100;
  if (/car-insurance|two-wheeler|health-insurance|travel-insurance|home-insurance/.test(p)) return 85;
  if (/renew|add-on/.test(p)) return 75;
  if (/plan|compare|claims/.test(p)) return 60;
  if (/about|contact|faq|blog|press|career/.test(p)) return 20;
  return 40;
}

module.exports = { discoverAllUrls, scoreUrl };
