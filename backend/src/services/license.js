/**
 * License validation — OFFLINE, public-key only.
 *
 * Keys are Ed25519-signed by the separate License Key Generator app
 * (which holds the private key). This service only verifies signatures;
 * it cannot create keys.
 *
 * No license (or invalid/expired license) => TRIAL MODE: 3 pages per scan.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Public key from the License Key Generator app. If you rotate the keypair
// there (--new-keypair), paste the new public key here and redistribute.
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA6uXiKx7GcW71kgWF9+BQ5c0gdz43Z1nvHnfpj55rywU=
-----END PUBLIC KEY-----`;

const TRIAL_PAGE_LIMIT = 3;

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LICENSE_PATH = path.join(DATA_DIR, 'license.key');

function fromB64url(s) { return Buffer.from(s, 'base64url'); }

function validateKey(key) {
  try {
    const parts = (key || '').trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'IRDAI1') {
      return { valid: false, reason: 'Malformed license key' };
    }
    const [, payloadB64, sigB64] = parts;
    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const ok = crypto.verify(null, Buffer.from(payloadB64), publicKey, fromB64url(sigB64));
    if (!ok) return { valid: false, reason: 'Signature verification failed — key was not issued by your license generator' };

    const payload = JSON.parse(fromB64url(payloadB64).toString());
    if (new Date(payload.expires + 'T23:59:59Z') < new Date()) {
      return { valid: false, reason: `License expired on ${payload.expires}` };
    }
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, reason: `Could not parse key: ${e.message}` };
  }
}

/**
 * Returns the current effective license state:
 *   { licensed, trial, max_pages, licensee, expires, reason }
 * max_pages: -1 means unlimited; trial mode returns TRIAL_PAGE_LIMIT.
 */
function getLicenseState() {
  if (!fs.existsSync(LICENSE_PATH)) {
    return { licensed: false, trial: true, max_pages: TRIAL_PAGE_LIMIT, reason: 'No license key installed — trial mode' };
  }
  const key = fs.readFileSync(LICENSE_PATH, 'utf8');
  const result = validateKey(key);
  if (!result.valid) {
    return { licensed: false, trial: true, max_pages: TRIAL_PAGE_LIMIT, reason: result.reason };
  }
  return {
    licensed: true,
    trial: false,
    max_pages: result.payload.max_pages,
    licensee: result.payload.licensee,
    expires: result.payload.expires,
    key_id: result.payload.key_id,
  };
}

/**
 * Install a license key (called from the API when the user pastes a key).
 * Validates before saving; rejects invalid keys.
 */
function installKey(key) {
  const result = validateKey(key);
  if (!result.valid) return { ok: false, reason: result.reason };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LICENSE_PATH, key.trim());
  return { ok: true, payload: result.payload };
}

function removeKey() {
  if (fs.existsSync(LICENSE_PATH)) fs.unlinkSync(LICENSE_PATH);
  return { ok: true };
}

module.exports = { getLicenseState, installKey, removeKey, validateKey, TRIAL_PAGE_LIMIT };
