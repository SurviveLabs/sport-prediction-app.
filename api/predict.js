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

  // 1. Calculate Expected Scores
  const homeXG = Math.max(0.1, (homeAvgScored + awayAvgConceded) / 2);
  const awayXG = Math.max(0.1, (awayAvgScored + homeAvgConceded) / 2);
  const totalXG = homeXG + awayXG;

  const homeScoreInt = Math.round(homeXG);
  const awayScoreInt = Math.round(awayXG);

  // Sports without draws
  const noDrawSports = ['basketball', 'tennis', 'table_tennis', 'volleyball', 'baseball', 'american_football', 'esports'];
  const isNoDraw = noDrawSports.includes(sport);

  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;

  if (isNoDraw) {
    pDraw = 0;
    // Logistic curve for high-scoring sports
    const diff = homeXG - awayXG;
    pHomeWin = 1 / (1 + Math.exp(-diff / 8)); 
    pAwayWin = 1 - pHomeWin;
  } else {
    // Poisson matrix for low-scoring sports (Football, Hockey)
    function poisson(k, lambda) {
      const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
      return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
    }
    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const prob = poisson(h, homeXG) * poisson(a, awayXG);
        if (h > a) pHomeWin += prob;
        else if (h === a) pDraw += prob;
        else pAwayWin += prob;
      }
    }
  }

  // Calculate Market Probabilities
  const probHomeMoneyline = Math.min(99, Math.max(1, Math.round(pHomeWin * 100)));
  const probAwayMoneyline = Math.min(99, Math.max(1, Math.round(pAwayWin * 100)));
  
  const prob1X = isNoDraw ? probHomeMoneyline : Math.min(99, Math.round((pHomeWin + pDraw) * 100));
  const probX2 = isNoDraw ? probAwayMoneyline : Math.min(99, Math.round((pAwayWin + pDraw) * 100));
  const prob12 = isNoDraw ? 100 : Math.min(99, Math.round((pHomeWin + pAwayWin) * 100));

  // Dynamic Totals & BTTS
  let overLine = 1.5;
  let lineLabel = "Goals";
  let bttsLabel = "Both Teams to Score (BTTS)";

  if (sport === 'basketball') {
    overLine = Math.floor(totalXG - 2.5) + 0.5;
    lineLabel = "Points";
    bttsLabel = "Both Teams 100+ Points";
  }

  let probOver = totalXG > overLine ? Math.min(88, Math.round(50 + (totalXG - overLine) * 5)) : 42;
  const probBTTS = (homeXG >= 100 && awayXG >= 100) ? 92 : 45;

  const requiredGate = tier === 'lower' ? 80 : 75;
  const allProbabilities = [prob1X, probX2, probOver, probBTTS];
  const maxConfidence = Math.max(...allProbabilities);
  const passedFilter = maxConfidence >= requiredGate;

  const markets = [
    {
      name: isNoDraw ? `${homeName} Moneyline (Match Winner)` : `1X (${homeName} or Draw)`,
      probability: prob1X,
      fairOdds: (100 / Math.max(1, prob1X)).toFixed(2)
    },
    {
      name: isNoDraw ? `${awayName} Moneyline (Match Winner)` : `X2 (${awayName} or Draw)`,
      probability: probX2,
      fairOdds: (100 / Math.max(1, probX2)).toFixed(2)
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
    }
  ];

  return res.status(200).json({
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    passedFilter,
    requiredGate,
    markets
  });
}
