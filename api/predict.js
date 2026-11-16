export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    sport,
    tier = 'major',
    homeName = 'Home',
    awayName = 'Away',
    homeAvgScored,
    homeAvgConceded,
    awayAvgScored,
    awayAvgConceded,
    homeFormWeight = 5,
    awayFormWeight = 5,
    homeKeyAbsences = 0,
    awayKeyAbsences = 0
  } = req.body;

  // 1. INPUT ADJUSTMENTS & FORM/ABSENCE DYNAMICS
  const homeFormFactor = 0.88 + (homeFormWeight / 10) * 0.24;
  const awayFormFactor = 0.88 + (awayFormWeight / 10) * 0.24;

  const homeAttackMod = Math.max(0.75, 1.0 - (homeKeyAbsences * 0.04));
  const homeDefenseMod = Math.min(1.30, 1.0 + (homeKeyAbsences * 0.04));

  const awayAttackMod = Math.max(0.75, 1.0 - (awayKeyAbsences * 0.04));
  const awayDefenseMod = Math.min(1.30, 1.0 + (awayKeyAbsences * 0.04));

  let rawHomeXG = ((homeAvgScored * homeFormFactor * homeAttackMod) + (awayAvgConceded * awayDefenseMod)) / 2;
  let rawAwayXG = ((awayAvgScored * awayFormFactor * awayAttackMod) + (homeAvgConceded * homeDefenseMod)) / 2;

  let homeXG = 0;
  let awayXG = 0;

  if (sport === 'basketball') {
    homeXG = Math.max(40, rawHomeXG + 2.5);
    awayXG = Math.max(40, rawAwayXG - 1.5);
  } else {
    homeXG = Math.max(0.10, rawHomeXG * 1.12);
    awayXG = Math.max(0.10, rawAwayXG * 0.90);
  }

  const totalXG = homeXG + awayXG;
  const homeScoreInt = Math.round(homeXG);
  const awayScoreInt = Math.round(awayXG);

  let markets = [];
  let maxConfidence = 0;

  // 2. BASKETBALL MODEL (MONEYLINE & TOTALS)
  if (sport === 'basketball') {
    const diff = homeXG - awayXG;
    const pHomeWin = 1 / (1 + Math.exp(-diff / 6.5));
    const pAwayWin = 1 - pHomeWin;

    const probHomeWin = Math.min(99, Math.max(1, Math.round(pHomeWin * 100)));
    const probAwayWin = Math.min(99, Math.max(1, Math.round(pAwayWin * 100)));

    const targetLine = Math.floor(totalXG - 3.5) + 0.5;
    const zScore = (totalXG - targetLine) / 16.5;
    const probOver = Math.min(95, Math.max(5, Math.round((1 / (1 + Math.exp(-1.7 * zScore))) * 100)));
    const probUnder = 100 - probOver;

    const halfXG = totalXG * 0.51;
    const halfOverLine = Math.floor(halfXG - 2.0) + 0.5;
    const halfZ = (halfXG - halfOverLine) / 11.5;
    const probHalfOver = Math.min(95, Math.max(5, Math.round((1 / (1 + Math.exp(-1.7 * halfZ))) * 100)));

    maxConfidence = Math.max(probHomeWin, probAwayWin, probOver);

    markets = [
      { name: `${homeName} Moneyline (Match Winner)`, probability: probHomeWin, fairOdds: (100 / probHomeWin).toFixed(2) },
      { name: `${awayName} Moneyline (Match Winner)`, probability: probAwayWin, fairOdds: (100 / probAwayWin).toFixed(2) },
      { name: `Over ${targetLine} Total Points`, probability: probOver, fairOdds: (100 / probOver).toFixed(2) },
      { name: `Under ${targetLine} Total Points`, probability: probUnder, fairOdds: (100 / probUnder).toFixed(2) },
      { name: `1st Half Over ${halfOverLine} Points`, probability: probHalfOver, fairOdds: (100 / probHalfOver).toFixed(2) }
    ];
  }

  // 3. FOOTBALL MODEL (NORMALIZED DIXON-COLES POISSON)
  else {
    function poisson(k, lambda) {
      let fact = 1;
      for (let i = 2; i <= k; i++) fact *= i;
      return (Math.pow(lambda, k) * Math.exp(-lambda)) / fact;
    }

    function dixonColesTau(h, a, lambdaH, lambdaA, rho = -0.11) {
      if (h === 0 && a === 0) return 1 - (lambdaH * lambdaA * rho);
      if (h === 1 && a === 0) return 1 + (lambdaA * rho);
      if (h === 0 && a === 1) return 1 + (lambdaH * rho);
      if (h === 1 && a === 1) return 1 - rho;
      return 1.0;
    }

    let rawHomeWin = 0, rawDraw = 0, rawAwayWin = 0;

    for (let h = 0; h <= 10; h++) {
      for (let a = 0; a <= 10; a++) {
        const rawProb = poisson(h, homeXG) * poisson(a, awayXG);
        const tau = dixonColesTau(h, a, homeXG, awayXG);
        const prob = Math.max(0, rawProb * tau);

        if (h > a) rawHomeWin += prob;
        else if (h === a) rawDraw += prob;
        else rawAwayWin += prob;
      }
    }

    // Normalize probabilities to 100% total mass
    const totalProb = rawHomeWin + rawDraw + rawAwayWin;
    const pHomeWin = rawHomeWin / totalProb;
    const pDraw = rawDraw / totalProb;
    const pAwayWin = rawAwayWin / totalProb;

    const prob1X = Math.min(99, Math.max(1, Math.round((pHomeWin + pDraw) * 100)));
    const probX2 = Math.min(99, Math.max(1, Math.round((pAwayWin + pDraw) * 100)));
    const prob12 = Math.min(99, Math.max(1, Math.round((pHomeWin + pAwayWin) * 100)));

    const pUnder25 = poisson(0, totalXG) + poisson(1, totalXG) + poisson(2, totalXG);
    const probUnder25 = Math.min(99, Math.max(1, Math.round(pUnder25 * 100)));
    const probOver15 = Math.min(99, Math.max(1, Math.round((1 - (poisson(0, totalXG) + poisson(1, totalXG))) * 100)));
    const probBTTS = Math.min(95, Math.max(1, Math.round((1 - poisson(0, homeXG)) * (1 - poisson(0, awayXG)) * 100)));

    maxConfidence = Math.max(prob1X, probX2, prob12, probOver15, probUnder25);

    markets = [
      { name: `1X (${homeName} or Draw)`, probability: prob1X, fairOdds: (100 / prob1X).toFixed(2) },
      { name: `X2 (${awayName} or Draw)`, probability: probX2, fairOdds: (100 / probX2).toFixed(2) },
      { name: `12 (Home or Away Win - No Draw)`, probability: prob12, fairOdds: (100 / prob12).toFixed(2) },
      { name: `Over 1.5 Goals`, probability: probOver15, fairOdds: (100 / probOver15).toFixed(2) },
      { name: `Under 2.5 Goals`, probability: probUnder25, fairOdds: (100 / probUnder25).toFixed(2) },
      { name: `Both Teams to Score (BTTS)`, probability: probBTTS, fairOdds: (100 / probBTTS).toFixed(2) }
    ];
  }

  // Tier gating logic retained for UI status, but never restricts output
  const requiredGate = tier === 'lower' ? 80 : 75;
  const passedFilter = maxConfidence >= requiredGate;

  return res.status(200).json({
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    passedFilter,
    requiredGate,
    maxConfidence,
    markets
  });
}
