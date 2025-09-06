const express = require('express');
const router = express.Router();
const EventBus = require('../services/eventBus');

/**
 * Server-Sent Events stream for real-time updates.
 * Query: world_id (required), player_character_id (optional but recommended)
 */
router.get('/', (req, res) => {
  const { world_id, player_character_id } = req.query || {};
  if (!world_id) return res.status(400).end('Missing world_id');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders && res.flushHeaders();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      // ignore write errors
    }
  };

  const onProgress = (payload) => {
    if (!payload || payload.world_id !== world_id) return;
    if (player_character_id && payload.acceptedBy && String(payload.acceptedBy) !== String(player_character_id)) return;
    send('quest:progress', payload);
  };
  const onState = (payload) => {
    if (!payload || payload.world_id !== world_id) return;
    if (player_character_id && payload.acceptedBy && String(payload.acceptedBy) !== String(player_character_id)) return;
    send('quest:state', payload);
  };

  EventBus.on('quest:progress', onProgress);
  EventBus.on('quest:state', onState);

  // Heartbeat to keep connection alive
  const hb = setInterval(() => send('ping', { t: Date.now() }), 25000);

  req.on('close', () => {
    clearInterval(hb);
    EventBus.off('quest:progress', onProgress);
    EventBus.off('quest:state', onState);
    try { res.end(); } catch {}
  });
});

module.exports = router;

