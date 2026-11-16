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
    sport = 'football', 
    tier = 'major', 
    homeName = 'Home', 
    awayName = 'Away', 
    homeAvgScored = 1.5, 
    homeAvgConceded = 1.0, 
    awayAvgScored = 1.2, 
    awayAvgConceded = 1.3,
    homeFormWeight = 7,
    awayFormWeight = 7,
    homeKeyAbsences = 0,
    awayKeyAbsences = 0,
    customBookieLine = null,
    bookieOdds = null
  } = req.body;

  // Realistic sharp betting thresholds (55% Major, 60% Lower Tier)
  const requiredGate = tier === 'lower' ? 60 : 55;

  const homeFormFactor = 0.88 + (homeFormWeight / 10) * 0.24;
  const awayFormFactor = 0.88 + (awayFormWeight / 10) * 0.24;

  const homeAttackMod = Math.max(0.75, 1.0 - (homeKeyAbsences * 0.04));
  const homeDefenseMod = Math.min(1.30, 1.0 + (homeKeyAbsences * 0.04));
  const awayAttackMod = Math.max(0.75, 1.0 - (awayKeyAbsences * 0.04));
  const awayDefenseMod = Math.min(1.30, 1.0 + (awayKeyAbsences * 0.04));

  let markets = [];
  let maxConfidence = 0;
  let homeScoreInt = 0;
  let awayScoreInt = 0;

  const evaluateMarket = (name, probability) => {
    const clampedProb = Math.min(99, Math.max(1, Math.round(probability)));
    const fairOdds = Number((100 / clampedProb).toFixed(2));
    let evPercentage = null;
    let isValueBet = false;

    if (bookieOdds !== null && !isNaN(bookieOdds) && bookieOdds > 1.0) {
      evPercentage = Number((((clampedProb / 100) * bookieOdds) - 1) * 100).toFixed(1);
      isValueBet = bookieOdds > fairOdds;
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

  switch (sport) {
    case 'basketball': {
      let homePts = Math.max(60, Math.round(((homeAvgScored * homeFormFactor * homeAttackMod) + (awayAvgConceded * homeDefenseMod)) / 2));
      let awayPts = Math.max(60, Math.round(((awayAvgScored * awayFormFactor * awayAttackMod) + (homeAvgConceded * awayDefenseMod)) / 2));
      
      const totalXG = homePts + awayPts;
      
      homeScoreInt = homePts;
      awayScoreInt = awayPts;

      const calcTotalProb = (line, stdDev = 16.5) => {
        const z = (totalXG - line) / stdDev;
        return (1 / (1 + Math.exp(-1.7 * z))) * 100;
      };

      const targetLine = (customBookieLine !== null && !isNaN(customBookieLine)) 
        ? Number(customBookieLine) 
        : (Math.floor(totalXG - 3.5) + 0.5);

      const probOver = calcTotalProb(targetLine);
      const probUnder = 100 - probOver;

      const halfXG = totalXG * 0.51;
      const halfOverLine = Math.floor(halfXG - 2.0) + 0.5;
      const halfZ = (halfXG - halfOverLine) / 11.5;
      const probHalfOver = Math.min(95, Math.max(5, (1 / (1 + Math.exp(-1.7 * halfZ))) * 100));
      const probHalfUnder = 100 - probHalfOver;

      // Track max confidence among model outputs
      maxConfidence = Math.max(probOver, probUnder, probHalfOver, probHalfUnder);

      markets = [
        evaluateMarket(`Over ${targetLine} Total Points`, probOver),
        evaluateMarket(`Under ${targetLine} Total Points`, probUnder),
        evaluateMarket(`1st Half Over ${halfOverLine} Points`, probHalfOver),
        evaluateMarket(`1st Half Under ${halfOverLine} Points`, probHalfUnder)
      ];
      break;
    }

    case 'football':
    default: {
      let rawHomeXG = ((homeAvgScored * homeFormFactor * homeAttackMod) + (awayAvgConceded * homeDefenseMod)) / 2;
      let rawAwayXG = ((awayAvgScored * awayFormFactor * awayAttackMod) + (homeAvgConceded * awayDefenseMod)) / 2;

      let homeXG = Math.max(0.10, rawHomeXG * 1.12);
      let awayXG = Math.max(0.10, rawAwayXG * 0.90);
      const totalXG = homeXG + awayXG;

      homeScoreInt = Math.round(homeXG);
      awayScoreInt = Math.round(awayXG);

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

      const totalProb = rawHomeWin + rawDraw + rawAwayWin;
      const pHomeWin = rawHomeWin / totalProb;
      const pDraw = rawDraw / totalProb;
      const pAwayWin = rawAwayWin / totalProb;

      const prob1X = (pHomeWin + pDraw) * 100;
      const probX2 = (pAwayWin + pDraw) * 100;
      const prob12 = (pHomeWin + pAwayWin) * 100;

      markets = [
        evaluateMarket(`1X (${homeName} or Draw)`, prob1X),
        evaluateMarket(`X2 (${awayName} or Draw)`, probX2),
        evaluateMarket(`12 (Home or Away Win)`, prob12)
      ];

      let customOverProb = 0;
      let customUnderProb = 0;

      if (customBookieLine !== null && !isNaN(customBookieLine)) {
        let cumulativeUnder = 0;
        let maxK = Math.floor(customBookieLine);
        for (let k = 0; k <= maxK; k++) {
          cumulativeUnder += poisson(k, totalXG);
        }
        customUnderProb = cumulativeUnder * 100;
        customOverProb = 100 - customUnderProb;

        markets.push(
          evaluateMarket(`Over ${customBookieLine} Goals`, customOverProb),
          evaluateMarket(`Under ${customBookieLine} Goals`, customUnderProb)
        );
      } else {
        const probOver15 = (1 - (poisson(0, totalXG) + poisson(1, totalXG))) * 100;
        const probUnder25 = (poisson(0, totalXG) + poisson(1, totalXG) + poisson(2, totalXG)) * 100;
        
        markets.push(
          evaluateMarket(`Over 1.5 Goals`, probOver15),
          evaluateMarket(`Under 2.5 Goals`, probUnder25)
        );
      }

      const probBTTS = ((1 - poisson(0, homeXG)) * (1 - poisson(0, awayXG))) * 100;
      markets.push(evaluateMarket(`Both Teams to Score (BTTS)`, probBTTS));

      // Max confidence among core profitable lean markets
      maxConfidence = Math.max(prob1X, customOverProb > 0 ? customOverProb : 0, probBTTS);
      break;
    }
  }

  const passedFilter = maxConfidence >= requiredGate;

  return res.status(200).json({
    sport,
    leagueTier: tier,
    requiredGate,
    maxConfidence: Math.round(maxConfidence),
    passedFilter,
    expectedScore: { home: homeScoreInt, away: awayScoreInt },
    markets
  });
}
