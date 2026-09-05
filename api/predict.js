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
    awayAvgConceded,
    leagueAvgScored // Optional league baseline input (defaults applied if omitted)
  } = req.body;

  // ---------------------------------------------------------
  // 1. LEAGUE BASELINE & HOME ADVANTAGE ADJUSTMENTS
  // ---------------------------------------------------------
  let homeXG = 0;
  let awayXG = 0;

  if (sport === 'basketball') {
    // Basketball League Average baseline (~105 pts per team)
    const baseLeagueAvg = leagueAvgScored || 105.0;
    
    // Attack and Defense Ratings relative to League Average
    const homeAttack = homeAvgScored / baseLeagueAvg;
    const homeDefense = homeAvgConceded / baseLeagueAvg;
    const awayAttack = awayAvgScored / baseLeagueAvg;
    const awayDefense = awayAvgConceded / baseLeagueAvg;

    // Expected Base Points
    let rawHome = homeAttack * awayDefense * baseLeagueAvg;
    let rawAway = awayAttack * homeDefense * baseLeagueAvg;

    // +3.0 Points Home-Court Advantage
    homeXG = Math.max(50, rawHome + 3.0);
    awayXG = Math.max(50, rawAway - 3.0);
  } else {
    // Football League Average baseline (~1.35 goals per team)
    const baseLeagueAvg = leagueAvgScored || 1.35;

    // Attack and Defense Ratings
    const homeAttack = homeAvgScored / baseLeagueAvg;
    const homeDefense = homeAvgConceded / baseLeagueAvg;
    const awayAttack = awayAvgScored / baseLeagueAvg;
    const awayDefense = awayAvgConceded / baseLeagueAvg;

    // Expected Base Goals
    let rawHome = homeAttack * awayDefense * baseLeagueAvg;
    let rawAway = awayAttack * homeDefense * baseLeagueAvg;

    // +0.25 Goals Home-Field Advantage
    homeXG = Math.max(0.1, rawHome + 0.25);
    awayXG = Math.max(0.1, rawAway - 0.25);
  }

  const totalXG = homeXG + awayXG;
  const homeScoreInt = Math.round(homeXG);
  const awayScoreInt = Math.round(awayXG);

  let markets = [];
  let maxConfidence = 0;

  // ---------------------------------------------------------
  // 2. BASKETBALL LOGIC (Zero-Draw Logistic Matrix)
  // ---------------------------------------------------------
  if (sport === 'basketball') {
    const diff = homeXG - awayXG;
    const pHomeWin = 1 / (1 + Math.exp(-diff / 8));
    const pAwayWin = 1 - pHomeWin;

    const probHomeWin = Math.min(99, Math.max(1, Math.round(pHomeWin * 100)));
    const probAwayWin = Math.min(99, Math.max(1, Math.round(pAwayWin * 100)));

    // Full Game Over/Under
    const overLine = Math.floor(totalXG - 2.5) + 0.5;
    const probOver = totalXG > overLine ? Math.min(88, Math.round(50 + (totalXG - overLine) * 5)) : 42;

    // 1st Half Over/Under (51.5% of Full Game Total)
    const halfXG = totalXG * 0.515;
    const halfOverLine = Math.floor(halfXG - 1.5) + 0.5;
    const probHalfOver = halfXG > halfOverLine ? Math.min(88, Math.round(50 + (halfXG - halfOverLine) * 6)) : 42;

    maxConfidence = Math.max(probHomeWin, probAwayWin, probOver, probHalfOver);

    markets = [
      {
        name: `${homeName} Moneyline (Match Winner)`,
        probability: probHomeWin,
        fairOdds: (100 / Math.max(1, probHomeWin)).toFixed(2)
      },
      {
        name: `${awayName} Moneyline (Match Winner)`,
        probability: probAwayWin,
        fairOdds: (100 / Math.max(1, probAwayWin)).toFixed(2)
      },
      {
        name: `Over ${overLine} Total Points (Full Game)`,
        probability: probOver,
        fairOdds: (100 / Math.max(1, probOver)).toFixed(2)
      },
      {
        name: `1st Half Over ${halfOverLine} Points`,
        probability: probHalfOver,
        fairOdds: (100 / Math.max(1, probHalfOver)).toFixed(2)
      }
    ];
  } 

  // ---------------------------------------------------------
  // 3. FOOTBALL LOGIC (Dixon-Coles Poisson Adjustment)
  // ---------------------------------------------------------
  else {
    function poisson(k, lambda) {
      const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
      return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
    }

    // Dixon-Coles Tau Adjustment factor for low-scoring matches
    function dixonColesTau(h, a, lambdaH, lambdaA, rho = -0.13) {
      if (h === 0 && a === 0) return 1 - (lambdaH * lambdaA * rho);
      if (h === 1 && a === 0) return 1 + (lambdaA * rho);
      if (h === 0 && a === 1) return 1 + (lambdaH * rho);
      if (h === 1 && a === 1) return 1 - rho;
      return 1.0;
    }

    let pHomeWin = 0, pDraw = 0, pAwayWin = 0;

    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const rawProb = poisson(h, homeXG) * poisson(a, awayXG);
        const tau = dixonColesTau(h, a, homeXG, awayXG);
        const prob = rawProb * tau;

        if (h > a) pHomeWin += prob;
        else if (h === a) pDraw += prob;
        else pAwayWin += prob;
      }
    }

    const prob1X = Math.min(99, Math.round((pHomeWin + pDraw) * 100));
    const probX2 = Math.min(99, Math.round((pAwayWin + pDraw) * 100));
    const prob12 = Math.min(99, Math.round((pHomeWin + pAwayWin) * 100));

    const probOver15 = Math.round((1 - (poisson(0, totalXG) + poisson(1, totalXG))) * 100);
    const probBTTS = Math.min(95, Math.round((1 - poisson(0, homeXG)) * (1 - poisson(0, awayXG)) * 100));

    maxConfidence = Math.max(prob1X, probX2, prob12, probOver15, probBTTS);

    markets = [
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
        name: `Over 1.5 Goals`,
        probability: probOver15,
        fairOdds: (100 / Math.max(1, probOver15)).toFixed(2)
      },
      {
        name: `Both Teams to Score (BTTS)`,
        probability: probBTTS,
        fairOdds: (100 / Math.max(1, probBTTS)).toFixed(2)
      }
    ];
  }

  // Gate filtering logic
  const requiredGate = tier === 'lower' ? 80 : 75;
  const passedFilter = maxConfidence >= requiredGate;

  return res.status(200).json({
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    passedFilter,
    requiredGate,
    markets
  });
}
