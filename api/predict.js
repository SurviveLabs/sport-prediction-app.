export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    tier = 'major', 
    homeName = 'Home', 
    awayName = 'Away', 
    homeAvgScored = 112.5, 
    homeAvgConceded = 108.0, 
    awayAvgScored = 109.0, 
    awayAvgConceded = 111.5,
    homeFormWeight = 7,
    awayFormWeight = 7,
    customBookieLine = null,
    bookieOdds = null
  } = req.body;

  // Sharp betting thresholds (55% Major, 60% Lower Tier)
  const requiredGate = tier === 'lower' ? 60 : 55;

  // Form Modifiers
  const homeFormFactor = 0.88 + (homeFormWeight / 10) * 0.24;
  const awayFormFactor = 0.88 + (awayFormWeight / 10) * 0.24;

  // Expected Team Points Calculation (PPG + Form + Home Court Advantage)
  let rawHomePts = ((homeAvgScored * homeFormFactor) + awayAvgConceded) / 2;
  let rawAwayPts = ((awayAvgScored * awayFormFactor) + homeAvgConceded) / 2;

  let homePts = Math.max(60, Math.round(rawHomePts + 1.5));
  let awayPts = Math.max(60, Math.round(rawAwayPts - 1.5));

  const totalXG = homePts + awayPts;

  // Market Evaluation Helper
  const evaluateMarket = (name, probability) => {
    const clampedProb = Math.min(99, Math.max(1, Math.round(probability)));
    const fairOdds = Number((100 / clampedProb).toFixed(2));
    let evPercentage = null;
    let isValueBet = false;

    if (bookieOdds !== null && !isNaN(bookieOdds) && bookieOdds > 1.0) {
      const rawEV = (((clampedProb / 100) * bookieOdds) - 1) * 100;
      evPercentage = Number(rawEV).toFixed(1);
      isValueBet = rawEV > 0 && bookieOdds > fairOdds;
    }

    return {
      name,
      probability: clampedProb,
      fairOdds: fairOdds.toFixed(2),
      bookieOdds: (bookieOdds !== null && !isNaN(bookieOdds)) ? Number(bookieOdds).toFixed(2) : null,
      evPercentage: evPercentage !== null ? `${evPercentage}%` : null,
      isValueBet
    };
  };

  // Basketball Totals Probability (Normal Distribution approximation)
  const calcTotalProb = (line, stdDev = 15.5) => {
    const z = (totalXG - line) / stdDev;
    return (1 / (1 + Math.exp(-1.7 * z))) * 100;
  };

  const targetLine = (customBookieLine !== null && !isNaN(customBookieLine) && Number(customBookieLine) > 100)
    ? Number(customBookieLine)
    : (Math.floor(totalXG - 2.5) + 0.5);

  const probOver = calcTotalProb(targetLine);
  const probUnder = 100 - probOver;

  // 1st Half Totals
  const halfXG = totalXG * 0.51;
  const halfOverLine = Math.floor(halfXG - 1.5) + 0.5;
  const halfZ = (halfXG - halfOverLine) / 10.5;
  const probHalfOver = Math.min(95, Math.max(5, (1 / (1 + Math.exp(-1.7 * halfZ))) * 100));
  const probHalfUnder = 100 - probHalfOver;

  // Moneyline Probability
  const pointDiff = homePts - awayPts;
  const mlZ = pointDiff / 11.0;
  const probHomeWin = Math.min(95, Math.max(5, (1 / (1 + Math.exp(-1.7 * mlZ))) * 100));
  const probAwayWin = 100 - probHomeWin;

  const markets = [
    evaluateMarket(`Over ${targetLine} Total Points`, probOver),
    evaluateMarket(`Under ${targetLine} Total Points`, probUnder),
    evaluateMarket(`1st Half Over ${halfOverLine} Points`, probHalfOver),
    evaluateMarket(`1st Half Under ${halfOverLine} Points`, probHalfUnder),
    evaluateMarket(`${homeName} Win (Moneyline)`, probHomeWin),
    evaluateMarket(`${awayName} Win (Moneyline)`, probAwayWin)
  ];

  const maxConfidence = Math.max(probOver, probUnder, probHalfOver, probHalfUnder, probHomeWin, probAwayWin);
  const passedFilter = maxConfidence >= requiredGate;

  return res.status(200).json({
    sport: 'basketball',
    leagueTier: tier,
    requiredGate,
    maxConfidence: Math.round(maxConfidence),
    passedFilter,
    expectedScore: { home: homePts, away: awayPts },
    markets
  });
}
