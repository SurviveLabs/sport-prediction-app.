// Helper: Poisson probability function
function poisson(k, lambda) {
  let factorial = 1;
  for (let i = 1; i <= k; i++) factorial *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

// Helper: Calculate football matrix probabilities up to 6x6 scorelines
function calculateFootballMatrix(xGHome, xGAway) {
  let probHome = 0, probDraw = 0, probAway = 0;
  let probOver15 = 0, probOver25 = 0, probBTTS = 0;

  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = poisson(h, xGHome) * poisson(a, xGAway);
      
      if (h > a) probHome += p;
      else if (h === a) probDraw += p;
      else probAway += p;

      if (h + a > 1.5) probOver15 += p;
      if (h + a > 2.5) probOver25 += p;
      if (h > 0 && a > 0) probBTTS += p;
    }
  }

  return { probHome, probDraw, probAway, probOver15, probOver25, probBTTS };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    sport = 'football',
    homeTeam = 'Home',
    awayTeam = 'Away',
    homeAvg = 1.5,
    homeConceded = 1.0,
    awayAvg = 1.2,
    awayConceded = 1.2,
    leagueTier = 'major'
  } = req.body;

  const hAvg = parseFloat(homeAvg) || 1.0;
  const hCon = parseFloat(homeConceded) || 1.0;
  const aAvg = parseFloat(awayAvg) || 1.0;
  const aCon = parseFloat(awayConceded) || 1.0;

  const autoThreshold = leagueTier === 'lower' ? 80 : 75;
  const threshDec = autoThreshold / 100;

  let bestPick = { title: 'NO BET / PASS', confidence: 0, passedFilter: false, desc: 'No market met the strict threshold edge.' };
  let projection = { homeGoals: 0, awayGoals: 0 };
  let stdMarkets = [];
  let comboMarkets = [];

  // ==========================================
  // 1. FOOTBALL ENGINE
  // ==========================================
  if (sport === 'football') {
    const xGHome = (hAvg + aCon) / 2;
    const xGAway = (aAvg + hCon) / 2;

    // Clean rounded integer representation for UI scoreline display
    projection = { 
      homeGoals: Math.round(xGHome), 
      awayGoals: Math.round(xGAway) 
    };

    const m = calculateFootballMatrix(xGHome, xGAway);
    const p1X = m.probHome + m.probDraw;
    const pX2 = m.probAway + m.probDraw;

    stdMarkets = [
      { label: `${homeTeam} Win (1)`, val: Math.round(m.probHome * 100) },
      { label: 'Draw (X)', val: Math.round(m.probDraw * 100) },
      { label: `${awayTeam} Win (2)`, val: Math.round(m.probAway * 100) },
      { label: `${homeTeam} Win or Draw (1X)`, val: Math.round(p1X * 100) },
      { label: `${awayTeam} Win or Draw (X2)`, val: Math.round(pX2 * 100) }
    ];

    comboMarkets = [
      { label: 'Over 1.5 Goals', val: Math.round(m.probOver15 * 100) },
      { label: 'Over 2.5 Goals', val: Math.round(m.probOver25 * 100) },
      { label: 'Both Teams To Score (BTTS)', val: Math.round(m.probBTTS * 100) }
    ];

    // Priority Selection Hierarchy: 1X/X2 -> Over 2.5 -> BTTS -> Straight Win -> Strict Over 1.5
    if (p1X >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} WIN OR DRAW (1X)`, confidence: Math.round(p1X * 100), passedFilter: true, desc: 'High structural home balance identified.' };
    } else if (pX2 >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} WIN OR DRAW (X2)`, confidence: Math.round(pX2 * 100), passedFilter: true, desc: 'Strong away double chance value found.' };
    } else if (m.probOver25 >= 0.68) {
      bestPick = { title: 'OVER 2.5 GOALS', confidence: Math.round(m.probOver25 * 100), passedFilter: true, desc: 'High total expected goals line met.' };
    } else if (m.probBTTS >= 0.70) {
      bestPick = { title: 'BOTH TEAMS TO SCORE (YES)', confidence: Math.round(m.probBTTS * 100), passedFilter: true, desc: 'Both sides exhibit high scoring and conceding rates.' };
    } else if (m.probHome >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} WIN (STRAIGHT)`, confidence: Math.round(m.probHome * 100), passedFilter: true, desc: 'Dominant home victory projection.' };
    } else if (m.probAway >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} WIN (STRAIGHT)`, confidence: Math.round(m.probAway * 100), passedFilter: true, desc: 'Dominant away victory projection.' };
    } else if (m.probOver15 >= 0.83) {
      bestPick = { title: 'OVER 1.5 GOALS', confidence: Math.round(m.probOver15 * 100), passedFilter: true, desc: 'Exceeds strict safety baseline.' };
    }

  // ==========================================
  // 2. BASKETBALL ENGINE
  // ==========================================
  } else if (sport === 'basketball') {
    const projHome = (hAvg + aCon) / 2;
    const projAway = (aAvg + hCon) / 2;
    const totalPoints = projHome + projAway;
    projection = { homeGoals: Math.round(projHome), awayGoals: Math.round(projAway) };

    const diff = projHome - projAway;
    const pHomeWin = 1 / (1 + Math.exp(-diff / 10));
    const pAwayWin = 1 - pHomeWin;
    const pOverLine = totalPoints > 220 ? 0.72 : totalPoints > 210 ? 0.65 : 0.48;

    stdMarkets = [
      { label: `${homeTeam} Moneyline`, val: Math.round(pHomeWin * 100) },
      { label: `${awayTeam} Moneyline`, val: Math.round(pAwayWin * 100) }
    ];

    comboMarkets = [
      { label: `Over ${Math.floor(totalPoints - 3)} Total Points`, val: Math.round(pOverLine * 100) },
      { label: `${diff > 0 ? homeTeam : awayTeam} -${Math.abs(Math.round(diff))} Handicap`, val: Math.round(Math.max(pHomeWin, pAwayWin) * 92) }
    ];

    if (pHomeWin >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} MONEYLINE`, confidence: Math.round(pHomeWin * 100), passedFilter: true, desc: 'High scoring differential advantage.' };
    } else if (pAwayWin >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} MONEYLINE`, confidence: Math.round(pAwayWin * 100), passedFilter: true, desc: 'Away offensive rating edge detected.' };
    } else if (pOverLine >= threshDec) {
      bestPick = { title: `OVER ${Math.floor(totalPoints - 3)} POINTS`, confidence: Math.round(pOverLine * 100), passedFilter: true, desc: 'High pace matchup expectation.' };
    }

  // ==========================================
  // 3. ICE HOCKEY ENGINE
  // ==========================================
  } else if (sport === 'ice_hockey') {
    const xGHome = (hAvg + aCon) / 2;
    const xGAway = (aAvg + hCon) / 2;
    projection = { homeGoals: Math.round(xGHome), awayGoals: Math.round(xGAway) };

    const pHomeWin = xGHome / (xGHome + xGAway + 0.5);
    const pAwayWin = xGAway / (xGHome + xGAway + 0.5);
    const pOver55 = (xGHome + xGAway) > 5.5 ? 0.76 : 0.52;

    stdMarkets = [
      { label: `${homeTeam} Match Winner`, val: Math.round(pHomeWin * 100) },
      { label: `${awayTeam} Match Winner`, val: Math.round(pAwayWin * 100) }
    ];

    comboMarkets = [
      { label: 'Over 5.5 Total Goals', val: Math.round(pOver55 * 100) },
      { label: `${homeTeam} +1.5 Puck Line`, val: Math.round((pHomeWin + 0.22) * 100) }
    ];

    if (pHomeWin >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} MONEYLINE`, confidence: Math.round(pHomeWin * 100), passedFilter: true, desc: 'Dominant net goal margin.' };
    } else if (pAwayWin >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} MONEYLINE`, confidence: Math.round(pAwayWin * 100), passedFilter: true, desc: 'Road offensive superiority.' };
    } else if (pOver55 >= threshDec) {
      bestPick = { title: 'OVER 5.5 GOALS', confidence: Math.round(pOver55 * 100), passedFilter: true, desc: 'Puck line volume threshold exceeded.' };
    }

  // ==========================================
  // 4. TENNIS ENGINE
  // ==========================================
  } else if (sport === 'tennis') {
    const p1Rating = (hAvg * 0.7) + (200 - aCon * 0.3);
    const p2Rating = (aAvg * 0.7) + (200 - hCon * 0.3);
    const p1Win = p1Rating / (p1Rating + p2Rating);
    const p2Win = 1 - p1Win;

    projection = { homeGoals: Math.round(p1Win * 2), awayGoals: Math.round(p2Win * 2) };

    stdMarkets = [
      { label: `${homeTeam} Match Winner`, val: Math.round(p1Win * 100) },
      { label: `${awayTeam} Match Winner`, val: Math.round(p2Win * 100) }
    ];

    comboMarkets = [
      { label: `${p1Win > p2Win ? homeTeam : awayTeam} 2-0 Sets`, val: Math.round(Math.max(p1Win, p2Win) * 68) },
      { label: 'Over 21.5 Total Games', val: 62 }
    ];

    if (p1Win >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} MATCH WINNER`, confidence: Math.round(p1Win * 100), passedFilter: true, desc: 'Superior serve/return hold efficiency.' };
    } else if (p2Win >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} MATCH WINNER`, confidence: Math.round(p2Win * 100), passedFilter: true, desc: 'Higher break-point conversion metric.' };
    }

  // ==========================================
  // 5. TABLE TENNIS ENGINE
  // ==========================================
  } else if (sport === 'table_tennis') {
    const p1Prob = hAvg / (hAvg + aAvg);
    const p2Prob = 1 - p1Prob;
    projection = { homeGoals: Math.round(p1Prob * 3), awayGoals: Math.round(p2Prob * 3) };

    stdMarkets = [
      { label: `${homeTeam} Match Winner`, val: Math.round(p1Prob * 100) },
      { label: `${awayTeam} Match Winner`, val: Math.round(p2Prob * 100) }
    ];

    comboMarkets = [
      { label: `${p1Prob > p2Prob ? homeTeam : awayTeam} -1.5 Games`, val: Math.round(Math.max(p1Prob, p2Prob) * 80) }
    ];

    if (p1Prob >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} MATCH WINNER`, confidence: Math.round(p1Prob * 100), passedFilter: true, desc: 'Set win rate consistency advantage.' };
    } else if (p2Prob >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} MATCH WINNER`, confidence: Math.round(p2Prob * 100), passedFilter: true, desc: 'Outperforming head-to-head metrics.' };
    }

  // ==========================================
  // 6–10. OTHER SPORTS ENGINE
  // ==========================================
  } else {
    const pHome = hAvg / (hAvg + aCon);
    const pAway = aAvg / (aAvg + hCon);
    const normHome = pHome / (pHome + pAway);
    const normAway = 1 - normHome;

    projection = { homeGoals: Math.round(normHome * 100), awayGoals: Math.round(normAway * 100) };

    stdMarkets = [
      { label: `${homeTeam} Win`, val: Math.round(normHome * 100) },
      { label: `${awayTeam} Win`, val: Math.round(normAway * 100) }
    ];

    comboMarkets = [
      { label: `${normHome > normAway ? homeTeam : awayTeam} Handicap Edge`, val: Math.round(Math.max(normHome, normAway) * 88) }
    ];

    if (normHome >= threshDec) {
      bestPick = { title: `${homeTeam.toUpperCase()} WIN`, confidence: Math.round(normHome * 100), passedFilter: true, desc: 'Performance ratings meet strict threshold.' };
    } else if (normAway >= threshDec) {
      bestPick = { title: `${awayTeam.toUpperCase()} WIN`, confidence: Math.round(normAway * 100), passedFilter: true, desc: 'Performance ratings meet strict threshold.' };
    }
  }

  return res.status(200).json({
    sport,
    leagueTier,
    autoThreshold,
    bestPick,
    projection,
    stdMarkets,
    comboMarkets
  });
                  }
