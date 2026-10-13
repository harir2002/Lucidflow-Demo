const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SKIP = [
  /\.(pdf|jpg|jpeg|png|gif|svg|css|js|xml|zip|doc|xls|mp4|webp|ico|woff|ttf)$/i,
  /\?.*utm/i, /#/, /\/sitemap/i, /\/cdn-cgi\//i, /\/assets\//i, /\/static\//i,
  /logout|signout/i, /\/api\//i,
];

class Crawler {
  constructor(cfg) {
    this.cfg = {
      targetUrl: cfg.targetUrl,
      delay: parseInt(cfg.crawlDelayMs) || 1000,
      width: parseInt(cfg.viewportWidth) || 1280,
      height: parseInt(cfg.viewportHeight) || 900,
      screensDir: cfg.screenshotsDir,
      sameDomain: cfg.sameDomainOnly !== false,
    };
    this.domain = new URL(cfg.targetUrl).hostname;
    fs.mkdirSync(this.cfg.screensDir, { recursive: true });
  }

  skip(url) { return SKIP.some(p => p.test(url)); }

  async screenshot(page, outPath) {
    const dims = await page.evaluate(() => ({
      h: Math.min(document.body.scrollHeight, document.documentElement.scrollHeight),
    })).catch(() => ({ h: 900 }));

    if (dims.h <= 7800) {
      await page.screenshot({ path: outPath, fullPage: true, timeout: 22000 });
    } else {
      await page.setViewportSize({ width: this.cfg.width, height: 7800 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await page.screenshot({ path: outPath, fullPage: false, timeout: 18000 });
      await page.setViewportSize({ width: this.cfg.width, height: this.cfg.height }).catch(() => {});
    }
  }

  async visitPage(context, url, onProgress) {
    const page = await context.newPage();
    page.on('download', d => d.cancel().catch(() => {}));
    try {
      if (onProgress) onProgress(`page:${url}`);

      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 28000 })
        .catch(() => page.goto(url, { waitUntil: 'commit', timeout: 15000 }).catch(() => null));

      if (!res) return null;
      if (res.status() >= 400) return null;

      const finalUrl = page.url();
      if (this.cfg.sameDomain && new URL(finalUrl).hostname !== this.domain) return null;

      await page.waitForTimeout(800).catch(() => {});
      await page.evaluate(() => new Promise(r => {
        const max = Math.min(document.body.scrollHeight, 6000);
        let pos = 0;
        const t = () => { window.scrollTo(0, pos += 400); if (pos < max) setTimeout(t, 100); else { window.scrollTo(0, 0); setTimeout(r, 200); } };
        t(); setTimeout(r, 3000);
      })).catch(() => {});

      const title = await page.title().catch(() => '');
      const slug = finalUrl.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80) + '_' + Date.now();
      const screenshotPath = path.join(this.cfg.screensDir, `${slug}.png`);
      await this.screenshot(page, screenshotPath);

      const domSignals = await page.evaluate(() => {
        const cbs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return {
          preChecked: cbs.filter(c => c.checked).map(c => ({ label: c.labels?.[0]?.innerText?.trim() || c.name || 'unknown' })),
          timers: document.querySelectorAll('[class*="countdown"],[class*="timer"]').length,
          popups: document.querySelectorAll('[class*="modal"],[class*="popup"],[class*="overlay"]').length,
          forms: document.querySelectorAll('form').length,
          badges: Array.from(document.querySelectorAll('[class*="badge"],[class*="tag"]')).map(b => b.innerText?.trim()).filter(Boolean).slice(0, 15),
          priceEls: Array.from(document.querySelectorAll('[class*="price"],[class*="premium"]')).map(e => e.innerText?.trim()).filter(Boolean).slice(0, 8),
          buttons: Array.from(document.querySelectorAll('button,a.btn,[class*="button"]')).map(b => b.innerText?.trim()).filter(t => t && t.length < 80).slice(0, 20),
          bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500),
          hasMultiStepFlow: /step\s*1|step\s*2|step\s*3/i.test(document.body.innerText || ''),
          hasLoginGate: document.querySelectorAll('input[type="password"]').length > 0,
          pageHeightPx: Math.min(document.body.scrollHeight, document.documentElement.scrollHeight),
        };
      }).catch(() => ({ preChecked: [], timers: 0, popups: 0, forms: 0, badges: [], priceEls: [], buttons: [], bodyText: '' }));

      const links = await page.evaluate(domain =>
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => { try { return new URL(a.href, location.href).href.split('#')[0]; } catch { return null; } })
          .filter(h => h && h.startsWith('http') && new URL(h).hostname === domain),
        this.domain
      ).catch(() => []);

      return { url: finalUrl, title, screenshotPath, domSignals, links: [...new Set(links)].filter(l => !this.skip(l)).slice(0, 60) };
    } catch (err) {
      if (onProgress) onProgress(`error:${err.message.slice(0, 60)}`);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  async _browser() {
    return chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }

  async _context(browser) {
    const ctx = await browser.newContext({
      viewport: { width: this.cfg.width, height: this.cfg.height },
      ignoreHTTPSErrors: true, acceptDownloads: false,
    });
    await ctx.route('**/*', route => {
      if (['media', 'font'].includes(route.request().resourceType())) return route.abort();
      route.continue();
    });
    return ctx;
  }

  async crawlUrls(urls, onProgress) {
    const browser = await this._browser();
    const context = await this._context(browser);
    const pages = [];
    try {
      for (let i = 0; i < urls.length; i++) {
        const r = await this.visitPage(context, urls[i], onProgress);
        if (r) pages.push(r);
        if (i < urls.length - 1) await new Promise(res => setTimeout(res, this.cfg.delay));
      }
    } finally { await browser.close().catch(() => {}); }
    return pages;
  }

  async discoverOnly(onProgress, maxDiscover = 500) {
    const browser = await this._browser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    await context.route('**/*', r => { if (['image', 'media', 'font', 'stylesheet'].includes(r.request().resourceType())) return r.abort(); r.continue(); });

    const discovered = new Set([this.cfg.targetUrl]);
    const queue = [this.cfg.targetUrl];
    const visited = new Set();
    try {
      while (queue.length && discovered.size < maxDiscover) {
        const url = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);
        if (onProgress) onProgress(`discover:${url}`);
        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          const links = await page.evaluate(d =>
            Array.from(document.querySelectorAll('a[href]'))
              .map(a => { try { return new URL(a.href, location.href).href.split('#')[0]; } catch { return null; } })
              .filter(h => h && h.startsWith('http') && new URL(h).hostname === d),
            this.domain
          ).catch(() => []);
          for (const l of links) { if (!this.skip(l)) { discovered.add(l); if (!visited.has(l)) queue.push(l); } }
        } finally { await page.close().catch(() => {}); }
        await new Promise(r => setTimeout(r, 500));
      }
    } finally { await browser.close().catch(() => {}); }
    return [...discovered];
  }
}

module.exports = { Crawler };
