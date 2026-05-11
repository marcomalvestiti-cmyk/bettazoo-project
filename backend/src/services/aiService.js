const ODDS_PRECISION = 10000;

function normalizeMarketOdds(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return { home: raw[0] || 2.0, draw: raw[1] || 3.40, away: raw[2] || 3.80 };
  }
  return raw;
}

const BOOKIE_MARGIN = 0.08; // simulated traditional bookie overround

function buildMockResponse(body) {
  const {
    teams = ['Home', 'Away'],
    sport = 'football',
    outcome,
    currentMarketOdds,
    margin: requestedMargin = 0.03,
  } = body;

  // trueBase = reference "fair" odds (live orderbook data or defaults)
  const trueBase = normalizeMarketOdds(currentMarketOdds) || { home: 2.0, draw: 3.40, away: 3.80 };

  // Traditional bookie crushes the odds with ~8% overround
  const bookieOdds = {
    home: +(trueBase.home / (1 + BOOKIE_MARGIN)).toFixed(2),
    draw: +(trueBase.draw / (1 + BOOKIE_MARGIN)).toFixed(2),
    away: +(trueBase.away / (1 + BOOKIE_MARGIN)).toFixed(2),
  };

  // Bettazoo Placer applies the selected margin (always < bookie's)
  const suggestedOdds = {
    home: +(trueBase.home / (1 + requestedMargin)).toFixed(2),
    draw: +(trueBase.draw / (1 + requestedMargin)).toFixed(2),
    away: +(trueBase.away / (1 + requestedMargin)).toFixed(2),
  };

  const implied = {
    home:  +(100 / suggestedOdds.home).toFixed(1),
    draw:  +(100 / suggestedOdds.draw).toFixed(1),
    away:  +(100 / suggestedOdds.away).toFixed(1),
  };
  const marginPercent = +(implied.home + implied.draw + implied.away - 100).toFixed(2);

  const riskLevel = (outcome !== undefined && body.placerExposureUsdt > 500) ? 'HIGH' : 'MEDIUM';

  return {
    trueBase,
    bookieOdds,
    suggestedOdds,
    appliedMargin: requestedMargin,
    impliedProbabilities: { ...implied, marginPercent },
    riskLevel,
    maxSafeExposureUsdt: riskLevel === 'HIGH' ? 300 : 1000,
    recommendation: `${teams[0]} vs ${teams[1] || 'Away'} — ${(requestedMargin * 100).toFixed(1)}% margin vs. ${(BOOKIE_MARGIN * 100).toFixed(0)}% traditional market.`,
    analysis: currentMarketOdds
      ? `Live orderbook data used as reference. ${(requestedMargin * 100).toFixed(1)}% Placer margin applied.`
      : `[MOCK] Default reference odds. Add OPENAI_API_KEY for real market analysis.`,
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
Given the following event data, suggest optimal European decimal odds for the placer (layer) with a safe 5% mathematical margin.

Event: ${body.eventName || body.eventId}
Sport: ${body.sport || 'football'}
Teams: ${(body.teams || []).join(' vs ')}
Current market odds: ${JSON.stringify(normalizeMarketOdds(body.currentMarketOdds) || {})}
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
      level: 'LOW',
      totalExposureUsdt: 0,
      message: 'No active offers. Create your first offer to start building your portfolio.',
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
      exposureUsdt: +liabilityUsdt.toFixed(2),
      sharePercent: totalUsdt > 0 ? +((liabilityUsdt / totalUsdt) * 100).toFixed(1) : 0,
    };
  }).sort((a, b) => b.sharePercent - a.sharePercent);

  const maxShare = exposures[0]?.sharePercent || 0;
  const level = maxShare > 70 ? 'HIGH' : maxShare > 40 ? 'MEDIUM' : 'LOW';

  const message = level === 'HIGH'
    ? 'Excessive imbalance on a single outcome — consider cancelling some offers.'
    : level === 'MEDIUM'
    ? 'Moderate exposure. Consider diversifying across more outcomes.'
    : 'Exposure is well balanced across your portfolio.';

  const recommendations = [];
  if (level === 'HIGH') recommendations.push(`Reduce liability on outcome ${exposures[0].outcome} of ${exposures[0].eventId}`);
  if (exposures.length === 1) recommendations.push('Diversify across multiple events or outcomes');
  if (totalUsdt > 2000) recommendations.push('High total exposure: consider cancelling some offers');

  return {
    level,
    totalExposureUsdt: +totalUsdt.toFixed(2),
    message,
    exposures,
    recommendations,
  };
}

module.exports = { suggestOdds, analyzeRisk };
