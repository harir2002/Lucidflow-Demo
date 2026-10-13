const express = require('express');
const { checkOllamaAvailable, MODEL_NAME, OLLAMA_HOST } = require('../services/vision');

const router = express.Router();

router.get('/status', async (req, res) => {
  const ollama = await checkOllamaAvailable();
  res.json({
    backend: 'ok',
    ollama_host: OLLAMA_HOST,
    model: MODEL_NAME,
    ollama_available: ollama.available,
    ollama_message: ollama.reason || 'Ready',
  });
});

module.exports = router;
