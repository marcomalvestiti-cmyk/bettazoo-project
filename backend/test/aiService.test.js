const { suggestOdds } = require('../src/services/aiService');

// No OPENAI_API_KEY in the test env — every call below exercises the mock/rule-based
// pricing path, which is also what runs in production until an OpenAI key is added.
// This is the Tier 2 "real pricing engine" surface: keeperService.js now feeds this
// function each event's live referenceOdds (Tier 0's odds feed, see
// services/eventsFeedService.js) as currentMarketOdds — these tests prove that once
// real market data is passed in, it actually drives the suggested price instead of
// silently falling back to the hardcoded default.

describe('suggestOdds — mock/rule-based pricing', () => {
  it('falls back to the hardcoded default reference odds when no market data is given', async () => {
    const result = await suggestOdds({ eventId: 'evt-x', outcome: 0, margin: 0.03 });
    expect(result.source).toBe('mock');
    expect(result.trueBase).toEqual({ home: 2.0, draw: 3.40, away: 3.80 });
    // suggestedOdds = trueBase / (1 + margin)
    expect(result.suggestedOdds.home).toBeCloseTo(2.0 / 1.03, 2);
  });

  it('prices off real market odds (the [home, draw, away] shape referenceOdds is stored in)', async () => {
    const liveMarketOdds = [1.85, 3.60, 4.20]; // a real Serie A fixture's consensus odds, say
    const result = await suggestOdds({
      eventId: 'live-abc123',
      outcome: 0,
      margin: 0.03,
      currentMarketOdds: liveMarketOdds,
    });
    expect(result.trueBase).toEqual({ home: 1.85, draw: 3.60, away: 4.20 });
    expect(result.suggestedOdds.home).toBeCloseTo(1.85 / 1.03, 2);
    expect(result.suggestedOdds.draw).toBeCloseTo(3.60 / 1.03, 2);
    expect(result.suggestedOdds.away).toBeCloseTo(4.20 / 1.03, 2);
    // The analysis text should acknowledge real data was used, not claim [MOCK] defaults.
    expect(result.analysis).not.toMatch(/\[MOCK\]/);
  });

  it('falls back per-leg when one side of the live odds is missing (e.g. no Draw quote)', async () => {
    const result = await suggestOdds({
      eventId: 'live-2way',
      outcome: 0,
      margin: 0.03,
      currentMarketOdds: [1.90, null, 3.95],
    });
    expect(result.trueBase.home).toBe(1.90);
    expect(result.trueBase.draw).toBe(3.40); // default fallback for the missing leg
    expect(result.trueBase.away).toBe(3.95);
  });

  it('a higher margin always yields worse (lower) odds than a lower margin off the same market data', async () => {
    const marketOdds = [2.10, 3.30, 3.40];
    const tight = await suggestOdds({ eventId: 'e', outcome: 0, margin: 0.015, currentMarketOdds: marketOdds });
    const wide  = await suggestOdds({ eventId: 'e', outcome: 0, margin: 0.05,  currentMarketOdds: marketOdds });
    expect(wide.suggestedOdds.home).toBeLessThan(tight.suggestedOdds.home);
  });
});
