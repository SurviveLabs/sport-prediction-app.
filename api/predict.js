export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sport, homeTeam, awayTeam, homeAvg, homeConceded, awayAvg, awayConceded, leagueTier } = req.body;

  const hA = parseFloat(homeAvg) || 1;
  const hC = parseFloat(homeConceded) || 1;
  const aA = parseFloat(awayAvg) || 1;
  const aC = parseFloat(awayConceded) || 1;

  const isLowerTier = (leagueTier === 'lower');
  const isIndividualSport = ['tennis', 'table_tennis'].includes(sport);
  const autoThreshold = (isLowerTier || isIndividualSport) ? 80 : 75;

  let homeProb = 0;
  let drawProb = 0;
  let awayProb = 0;
  let homeExp = 0;
  let awayExp = 0;

  if (sport === 'football') {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(85, Math.max(15, Math.round(45 + diff * 20)));
    awayProb = Math.min(85, Math.max(15, Math.round(30 - diff * 20)));
    drawProb = 100 - homeProb - awayProb;
  } else if (sport === 'basketball') {
    homeExp = Math.round((hA + aC) / 2);
    awayExp = Math.round((aA + hC) / 2);
    const diff = homeExp - awayExp;

    homeProb = Math.min(92, Math.max(8, Math.round(50 + diff * 3)));
    awayProb = 100 - homeProb;
    drawProb = 0;
  } else {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(85, Math.max(15, Math.round(45 + diff * 15)));
    awayProb = Math.min(85, Math.max(15, Math.round(35 - diff * 15)));
    drawProb = 100 - homeProb - awayProb;
  }

  const totalExp = homeExp + awayExp;
  const over15Prob = Math.min(95, Math.round(totalExp * 26));
  const over25Prob = Math.min(90, Math.round(totalExp * 21));
  const under25Prob = 100 - over25Prob;

  // Combination Market Calculations
  const homeAndOver15 = Math.round((homeProb * over15Prob) / 100 * 1.12);
  const homeAndOver25 = Math.round((homeProb * over25Prob) / 100 * 1.08);
  const homeAndUnder25 = Math.round((homeProb * under25Prob) / 100 * 0.92);

  const awayAndOver15 = Math.round((awayProb * over15Prob) / 100 * 1.12);
  const awayAndOver25 = Math.round((awayProb * over25Prob) / 100 * 1.08);
  const awayAndUnder25 = Math.round((awayProb * under25Prob) / 100 * 0.92);

  const drawAndOver15 = Math.round((drawProb * over15Prob) / 100 * 1.15);
  const drawAndUnder25 = Math.round((drawProb * under25Prob) / 100 * 0.88);

  const marketList = [
    { label: `${homeTeam.toUpperCase()} & OVER 1.5`, val: Math.min(92, homeAndOver15) },
    { label: `${homeTeam.toUpperCase()} & OVER 2.5`, val: Math.min(88, homeAndOver25) },
    { label: `${homeTeam.toUpperCase()} & UNDER 2.5`, val: Math.min(85, homeAndUnder25) },
    { label: `${awayTeam.toUpperCase()} & OVER 1.5`, val: Math.min(92, awayAndOver15) },
    { label: `${awayTeam.toUpperCase()} & OVER 2.5`, val: Math.min(88, awayAndOver25) },
    { label: `${awayTeam.toUpperCase()} & UNDER 2.5`, val: Math.min(85, awayAndUnder25) },
    { label: `DRAW & OVER 1.5`, val: Math.min(85, drawAndOver15) },
    { label: `DRAW & UNDER 2.5`, val: Math.min(85, drawAndUnder25) }
  ];

  marketList.sort((a, b) => b.val - a.val);

  const topPick = marketList[0];
  const passedFilter = topPick.val >= autoThreshold;

  res.status(200).json({
    autoThreshold,
    bestPick: {
      title: passedFilter ? topPick.label : 'NO BET / PASS',
      confidence: topPick.val,
      passedFilter,
      desc: passedFilter 
        ? `High-probability combination edge found at ${topPick.val}%.`
        : `Top combo edge was ${topPick.val}%, which falls below the ${autoThreshold}% safety cutoff.`
    },
    probabilities: { home: homeProb, draw: drawProb, away: awayProb },
    projection: { homeGoals: homeExp, awayGoals: awayExp },
    comboMarkets: marketList
  });
    }

