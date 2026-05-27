export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV no configurado' });
  }

  const type = req.query.type;
  const headers = { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' };

  // ── Mapeo type → clave en Upstash ──────────────────────────────
  // RecruitAI (app existente)
  const RECRUIT_KEYS = {
    results:   'results',
    reqs:      'reqs',
    feedbacks: 'feedbacks',
    jobs:      'jobs',
  };
  // EPP Control (app nueva) — prefijo "epp_" para no colisionar
  const EPP_KEYS = {
    epp_colaboradores: 'epp_colaboradores',
    epp_entregas:      'epp_entregas',
    epp_stock:         'epp_stock',
    epp_catalogo:      'epp_catalogo',
  };
  // Config compartida (clave-valor individual)
  const CONFIG_TYPES = new Set(['config', 'epp_config']);

  const ALL_ARRAY_KEYS = { ...RECRUIT_KEYS, ...EPP_KEYS };
  const key = ALL_ARRAY_KEYS[type];

  // ── CONFIG: lectura/escritura de clave-valor individual ─────────
  if (CONFIG_TYPES.has(type)) {
    const kvKey = type; // 'config' o 'epp_config'
    if (req.method === 'GET') {
      try {
        const r = await fetch(`${KV_URL}/get/${kvKey}`, { headers });
        const data = await r.json();
        let cfg = {};
        if (data.result) {
          try { cfg = typeof data.result === 'string' ? JSON.parse(data.result) : data.result; } catch(e) {}
        }
        return res.status(200).json({ config: cfg });
      } catch(e) {
        return res.status(200).json({ config: {} });
      }
    }
    if (req.method === 'POST') {
      try {
        const rg = await fetch(`${KV_URL}/get/${kvKey}`, { headers });
        const dg = await rg.json();
        let cfg = {};
        if (dg.result) {
          try { cfg = typeof dg.result === 'string' ? JSON.parse(dg.result) : dg.result; } catch(e) {}
        }
        cfg[req.body.key] = req.body.value;
        await fetch(`${KV_URL}/pipeline`, {
          method: 'POST', headers,
          body: JSON.stringify([["SET", kvKey, JSON.stringify(cfg)]])
        });
        return res.status(200).json({ ok: true });
      } catch(e) {
        return res.status(500).json({ error: e.message });
      }
    }
  }

  // ── Validar type conocido ───────────────────────────────────────
  if (!key) {
    return res.status(400).json({ error: `type "${type}" no reconocido` });
  }

  // ── GET — leer array ────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const r    = await fetch(`${KV_URL}/get/${key}`, { headers });
      const data = await r.json();
      let items  = [];
      if (data.result) {
        try {
          const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          items = Array.isArray(parsed) ? parsed : [];
        } catch(e) { items = []; }
      }
      return res.status(200).json({ [key]: items });
    } catch(e) {
      return res.status(200).json({ [key]: [] });
    }
  }

  // ── POST — escribir array ───────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const payload = req.body[key];
      if (payload === undefined) {
        return res.status(400).json({ error: `Payload key "${key}" no encontrada` });
      }
      const r = await fetch(`${KV_URL}/pipeline`, {
        method: 'POST', headers,
        body: JSON.stringify([["SET", key, JSON.stringify(payload)]])
      });
      const result = await r.json();
      if (result[0]?.error) return res.status(500).json({ error: result[0].error });
      return res.status(200).json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
