const express = require('express');
const { getLicenseState, installKey, removeKey } = require('../services/license');

const router = express.Router();

// Current license status
router.get('/', (req, res) => {
  res.json(getLicenseState());
});

// Activate a license key
router.post('/', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  const result = installKey(key);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ activated: true, ...getLicenseState() });
});

// Remove the installed license (back to trial mode)
router.delete('/', (req, res) => {
  removeKey();
  res.json({ removed: true, ...getLicenseState() });
});

module.exports = router;
