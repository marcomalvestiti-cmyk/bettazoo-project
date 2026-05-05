const ODDS_PRECISION = 10000;

function buildMockResponse(body) {
  const { teams = ['Home', 'Away'], sport = 'football', outcome, currentMarketOdds } = body;

  const base = currentMarketOdds || { home: 2.0, draw: 3.40, away: 3.80 };
  const margin = 0.057; // 5.7% margin

  const fair = {
    home: 1 / (1 / base.home * (1 + margin)),
    draw: 1 / (1 / base.draw * (1 + margin)),
    away: 1 / (1 / base.away * (1 + margin)),
  };

  const implied = {
    home:  +(100 / fair.home).toFixed(1),
    draw:  +(100 / fair.draw).toFixed(1),
    away:  +(100 / fair.away).toFixed(1),
  };
  const totalImplied = implied.home + implied.draw + implied.away;
  const marginPercent = +(totalImplied - 100).toFixed(2);

  const riskLevel = (outcome !== undefined && body.placerExposureUsdt > 500) ? 'HIGH' : 'MEDIUM';

  return {
    suggestedOdds: {
      home: +fair.home.toFixed(2),
      draw: +fair.draw.toFixed(2),
      away: +fair.away.toFixed(2),
    },
    impliedProbabilities: { ...implied, marginPercent },
    riskLevel,
    maxSafeExposureUsdt: riskLevel === 'HIGH' ? 300 : 1000,
    recommendation: `Quote ${teams[0]} vs ${teams[1] || 'Away'} con margine del ${marginPercent}%. ` +
      `Spread equilibrato per ${sport}.`,
    analysis: `[MOCK] Suggerimento generato localmente. Fornire OPENAI_API_KEY per analisi AI reale.`,
    source: 'mock',
  };
}

async function suggestOdds(body) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.startsWith('sk-...')) {
    return buildMockResponse(body);
  }

  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey });

  const prompt = `You are a professional sports betting analyst for a P2P betting exchange.
Given the following event data, suggest optimal European decimal odds for the placer (layer) with a safe mathematical margin.

Event: ${body.eventName || body.eventId}
Sport: ${body.sport || 'football'}
Teams: ${(body.teams || []).join(' vs ')}
Current market odds: ${JSON.stringify(body.currentMarketOdds || {})}
Placer current exposure: ${body.placerExposureUsdt || 0} USDT

Respond ONLY with valid JSON matching this schema:
{
  "suggestedOdds": { "home": number, "draw": number, "away": number },
  "impliedProbabilities": { "home": number, "draw": number, "away": number, "marginPercent": number },
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "maxSafeExposureUsdt": number,
  "recommendation": "string",
  "analysis": "string"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a sports betting odds analyst. Return only valid JSON, no markdown.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const result = JSON.parse(response.choices[0].message.content);
  return { ...result, source: 'openai' };
}

function analyzeRisk(orders) {
  if (orders.length === 0) {
    return {
      totalExposureUsdt: '0.00',
      riskLevel: 'LOW',
      alert: null,
      exposures: [],
      recommendations: [],
    };
  }

  const byKey = {};
  for (const o of orders) {
    const key = `${o.eventId}:${o.outcome}`;
    if (!byKey[key]) {
      byKey[key] = { eventId: o.eventId, outcome: o.outcome, totalLiability: 0n, orderCount: 0 };
    }
    byKey[key].totalLiability += BigInt(o.remainingLiability);
    byKey[key].orderCount++;
  }

  const totalBigInt = Object.values(byKey).reduce((s, e) => s + e.totalLiability, 0n);
  const totalUsdt = Number(totalBigInt) / 1_000_000;

  const exposures = Object.values(byKey).map(e => {
    const liabilityUsdt = Number(e.totalLiability) / 1_000_000;
    return {
      eventId: e.eventId,
      outcome: e.outcome,
      totalLiabilityUsdt: liabilityUsdt.toFixed(2),
      orderCount: e.orderCount,
      sharePercent: totalUsdt > 0 ? +((liabilityUsdt / totalUsdt) * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => b.sharePercent - a.sharePercent);

  const maxShare = exposures[0]?.sharePercent || 0;
  const riskLevel = maxShare > 70 ? 'HIGH' : maxShare > 40 ? 'MEDIUM' : 'LOW';

  const recommendations = [];
  if (riskLevel === 'HIGH') recommendations.push(`Riduci la liability su outcome ${exposures[0].outcome} di ${exposures[0].eventId}`);
  if (exposures.length === 1) recommendations.push('Diversifica le offerte su più eventi o esiti');
  if (totalUsdt > 2000) recommendations.push('Esposizione totale elevata: considera di cancellare alcune offerte');

  return {
    totalExposureUsdt: totalUsdt.toFixed(2),
    riskLevel,
    alert: riskLevel === 'HIGH' ? 'Sbilanciamento eccessivo su un singolo esito!' : null,
    exposures,
    recommendations,
  };
}

module.exports = { suggestOdds, analyzeRisk };
