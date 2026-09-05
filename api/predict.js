export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

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

  // 1. Calculate Expected Scores (xG / xP)
  const homeXG = Math.max(0.1, (homeAvgScored + awayAvgConceded) / 2);
  const awayXG = Math.max(0.1, (awayAvgScored + homeAvgConceded) / 2);
  const totalXG = homeXG + awayXG;

  const homeScoreInt = Math.round(homeXG);
  const awayScoreInt = Math.round(awayXG);

  // 2. Poisson probability helper
  function poisson(k, lambda) {
    const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }

  // Determine scoring matrix based on sport
  let maxMatrix = 10;
  if (['basketball', 'american_football', 'cricket'].includes(sport)) {
    maxMatrix = 300;
  } else if (['tennis', 'table_tennis', 'volleyball'].includes(sport)) {
    maxMatrix = 5;
  }

  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;

  if (maxMatrix <= 10) {
    for (let h = 0; h <= maxMatrix; h++) {
      for (let a = 0; a <= maxMatrix; a++) {
        const prob = poisson(h, homeXG) * poisson(a, awayXG);
        if (h > a) pHomeWin += prob;
        else if (h === a) pDraw += prob;
        else pAwayWin += prob;
      }
    }
  } else {
    pHomeWin = homeXG > awayXG ? 0.65 : 0.35;
    pAwayWin = 1 - pHomeWin;
    pDraw = 0.05;
  }

  // Calculate market probabilities
  const prob1X = Math.min(99, Math.round((pHomeWin + pDraw) * 100));
  const probX2 = Math.min(99, Math.round((pAwayWin + pDraw) * 100));
  const prob12 = Math.min(99, Math.round((pHomeWin + pAwayWin) * 100));

  // Sport-Specific Lines and Labels
  let overLine = 1.5;
  let lineLabel = "Goals";
  let bttsLabel = "Both Teams to Score (BTTS)";

  if (sport === 'basketball') {
    overLine = Math.floor(totalXG - 2.5) + 0.5;
    lineLabel = "Points";
    bttsLabel = "Both Teams 100+ Points";
  } else if (sport === 'tennis' || sport === 'table_tennis') {
    overLine = 2.5;
    lineLabel = "Sets";
    bttsLabel = "Both Win at least 1 Set";
  } else if (sport === 'ice_hockey') {
    overLine = 5.5;
    lineLabel = "Goals";
    bttsLabel = "Both Teams to Score 2+ Goals";
  } else if (sport === 'baseball') {
    overLine = 8.5;
    lineLabel = "Runs";
    bttsLabel = "Both Teams to Score 3+ Runs";
  } else if (sport === 'volleyball') {
    overLine = 3.5;
    lineLabel = "Sets";
    bttsLabel = "Both Win at least 1 Set";
  }

  let probOver = 50;
  if (lineLabel === "Goals" && overLine === 1.5) {
    probOver = Math.round((1 - (poisson(0, totalXG) + poisson(1, totalXG))) * 100);
  } else {
    probOver = totalXG > overLine ? Math.min(88, Math.round(50 + (totalXG - overLine) * 8)) : 42;
  }

  // BTTS / Both Win Set probability calculation
  const pHomeScore = 1 - poisson(0, homeXG);
  const pAwayScore = 1 - poisson(0, awayXG);
  const probBTTS = Math.min(95, Math.round(pHomeScore * pAwayScore * 100));

  // Gate filtering logic
  const requiredGate = tier === 'lower' ? 80 : 75;
  const allProbabilities = [prob1X, probX2, prob12, probOver, probBTTS];
  const maxConfidence = Math.max(...allProbabilities);
  const passedFilter = maxConfidence >= requiredGate;

  // 6 Expanded Markets
  const markets = [
    {
      name: `1X (${homeName} or Draw)`,
      probability: prob1X,
      fairOdds: (100 / Math.max(1, prob1X)).toFixed(2)
    },
    {
      name: `X2 (${awayName} or Draw)`,
      probability: probX2,
      fairOdds: (100 / Math.max(1, probX2)).toFixed(2)
    },
    {
      name: `12 (Home or Away Win - No Draw)`,
      probability: prob12,
      fairOdds: (100 / Math.max(1, prob12)).toFixed(2)
    },
    {
      name: `Over ${overLine} ${lineLabel}`,
      probability: probOver,
      fairOdds: (100 / Math.max(1, probOver)).toFixed(2)
    },
    {
      name: bttsLabel,
      probability: probBTTS,
      fairOdds: (100 / Math.max(1, probBTTS)).toFixed(2)
    },
    {
      name: `${homeName} Straight Win (Moneyline)`,
      probability: Math.round(pHomeWin * 100),
      fairOdds: (100 / Math.max(1, Math.round(pHomeWin * 100))).toFixed(2)
    }
  ];

  return res.status(200).json({
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    passedFilter,
    requiredGate,
    markets
  });
}
