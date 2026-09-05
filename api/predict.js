export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    sport,
    tier,
    homeName,
    awayName,
    homeAvgScored,
    homeAvgConceded,
    awayAvgScored,
    awayAvgConceded
  } = req.body;

  // 1. Calculate Expected Goals/Points (xG)
  const homeXG = Math.max(0.2, (homeAvgScored + awayAvgConceded) / 2);
  const awayXG = Math.max(0.2, (awayAvgScored + homeAvgConceded) / 2);

  // 2. Format Integer Scoreline
  const homeScoreInt = Math.round(homeXG);
  const awayScoreInt = Math.round(awayXG);

  // 3. Simple Poisson Probability Math
  function poisson(k, lambda) {
    const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }

  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const prob = poisson(h, homeXG) * poisson(a, awayXG);
      if (h > a) pHomeWin += prob;
      else if (h === a) pDraw += prob;
      else pAwayWin += prob;
    }
  }

  const prob1X = Math.round((pHomeWin + pDraw) * 100);
  const probX2 = Math.round((pAwayWin + pDraw) * 100);
  const totalXG = homeXG + awayXG;
  const probOver15 = Math.round((1 - (poisson(0, totalXG) + poisson(1, totalXG))) * 100);

  // 4. Threshold Filter Gate
  const requiredGate = tier === 'lower' ? 80 : 75;
  const maxConfidence = Math.max(prob1X, probX2, probOver15);
  const passedFilter = maxConfidence >= requiredGate;

  // 5. Market Selections
  const markets = [
    {
      name: `${homeName} or Draw (1X)`,
      probability: prob1X,
      fairOdds: (100 / Math.max(1, prob1X)).toFixed(2)
    },
    {
      name: `${awayName} or Draw (X2)`,
      probability: probX2,
      fairOdds: (100 / Math.max(1, probX2)).toFixed(2)
    },
    {
      name: 'Over 1.5 Goals/Points',
      probability: probOver15,
      fairOdds: (100 / Math.max(1, probOver15)).toFixed(2)
    }
  ];

  return res.status(200).json({
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    passedFilter,
    requiredGate,
    markets
  });
}
