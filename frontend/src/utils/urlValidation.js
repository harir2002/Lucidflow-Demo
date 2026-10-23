/**
 * URL validation for scan entry modes.
 * Ported from reference repository's urlUtils.js with adaptations for LucidFlow backend.
 */

/**
 * Validate a single URL entry for the given mode.
 * @param {string} raw - Raw user input (may lack scheme)
 * @param {string} mode - "one-page" or "main-domain"
 * @returns {object} { raw, ok: boolean, url?, host?, error? }
 */
function validateEntry(raw, mode) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { raw, ok: false, error: 'URL is empty' };

  // Normalize: add https:// if missing scheme
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return { raw, ok: false, error: 'Not a valid URL' };
  }

  // Validate hostname (must have TLD)
  if (!/\.[a-z]{2,}$/i.test(u.hostname)) {
    return { raw, ok: false, error: 'Not a valid URL' };
  }

  const isRoot = (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash;

  // Mode-specific validation
  if (mode === 'one-page' && isRoot) {
    return { raw, ok: false, error: 'This is a domain, not a page. Use "Discover pages on a domain"' };
  }
  if (mode === 'main-domain' && !isRoot) {
    return { raw, ok: false, error: 'This is a page URL. Enter only the domain' };
  }

  return {
    raw,
    ok: true,
    host: u.hostname,
    url: isRoot ? u.origin : u.origin + u.pathname + (u.search || ''),
  };
}

/**
 * Parse multiple URL entries (comma or newline separated).
 * @param {string} text - User input text
 * @param {string} mode - "one-page" or "main-domain"
 * @returns {array} Array of { raw, ok, url?, host?, error? }
 */
function parseUrls(text, mode) {
  const seen = new Set();
  const items = [];

  for (const raw of text.split(/[\s,]+/).filter(Boolean)) {
    const item = validateEntry(raw, mode);
    const key = item.url || raw.toLowerCase();

    // Skip duplicates
    if (seen.has(key)) continue;
    seen.add(key);

    items.push(item);
  }

  // Main-domain mode: only one domain allowed
  if (mode === 'main-domain') {
    items.forEach((it, idx) => {
      if (idx > 0) {
        it.ok = false;
        it.error = 'Only one domain at a time';
      }
    });
  }

  return items;
}

/**
 * Check if parsed entries are ready for scan.
 * @param {array} items - Result from parseUrls()
 * @returns {boolean} True if at least one valid entry exists and no errors
 */
function canScan(items) {
  return items.length > 0 && items.every(i => i.ok);
}

/**
 * Extract valid URLs for scan submission.
 * @param {array} items - Result from parseUrls()
 * @returns {array} Array of valid URLs only
 */
function getValidUrls(items) {
  return items.filter(i => i.ok).map(i => i.url);
}

export { parseUrls, canScan, getValidUrls };
