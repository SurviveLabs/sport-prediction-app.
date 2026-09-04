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
  const isIndividualSport = ['tennis', 'table_tennis', 'esports'].includes(sport);
  const autoThreshold = (isLowerTier || isIndividualSport) ? 80 : 75;

  let homeProb = 0;
  let drawProb = 0;
  let awayProb = 0;
  let homeExp = 0;
  let awayExp = 0;
  let totalLine = 2.5;
  let lineUnit = "GOALS";

  let stdMarkets = [];

  if (sport === 'football') {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(85, Math.max(15, Math.round(45 + diff * 20)));
    awayProb = Math.min(85, Math.max(15, Math.round(30 - diff * 20)));
    drawProb = 100 - homeProb - awayProb;
    totalLine = 2.5;
    lineUnit = "GOALS";

    const over15 = Math.min(95, Math.round((homeExp + awayExp) * 28));
    const over25 = Math.min(90, Math.round((homeExp + awayExp) * 21));
    const doubleChance = homeProb + drawProb;

    stdMarkets = [
      { label: `${homeTeam.toUpperCase()} WIN (STRAIGHT)`, val: homeProb },
      { label: `DRAW (1X2)`, val: drawProb },
      { label: `${awayTeam.toUpperCase()} WIN (STRAIGHT)`, val: awayProb },
      { label: `${homeTeam.toUpperCase()} WIN OR DRAW (1X)`, val: doubleChance },
      { label: `OVER 1.5 GOALS`, val: over15 },
      { label: `OVER 2.5 GOALS`, val: over25 }
    ];

  } else if (sport === 'basketball' || sport === 'american_football') {
    homeExp = Math.round((hA + aC) / 2);
    awayExp = Math.round((aA + hC) / 2);
    const diff = homeExp - awayExp;

    homeProb = Math.min(92, Math.max(8, Math.round(50 + diff * 3)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = Math.round(homeExp + awayExp - 2.5);
    lineUnit = "POINTS";

    stdMarkets = [
      { label: `${homeTeam.toUpperCase()} MONEYLINE`, val: homeProb },
      { label: `${awayTeam.toUpperCase()} MONEYLINE`, val: awayProb },
      { label: `OVER ${totalLine} TOTAL POINTS`, val: 78 },
      { label: `UNDER ${totalLine} TOTAL POINTS`, val: 38 }
    ];

  } else {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(85, Math.max(15, Math.round(45 + diff * 15)));
    awayProb = Math.min(85, Math.max(15, Math.round(35 - diff * 15)));
    drawProb = 100 - homeProb - awayProb;

    stdMarkets = [
      { label: `${homeTeam.toUpperCase()} STRAIGHT WIN`, val: homeProb },
      { label: `${awayTeam.toUpperCase()} STRAIGHT WIN`, val: awayProb },
      { label: `OVER 2.5 LINE`, val: 70 }
    ];
  }

  const overProb = 68;
  const underProb = 32;

  const hOver = Math.min(92, Math.round((homeProb * overProb) / 100 * 1.1));
  const hUnder = Math.min(88, Math.round((homeProb * underProb) / 100 * 0.95));
  const aOver = Math.min(92, Math.round((awayProb * overProb) / 100 * 1.1));
  const aUnder = Math.min(88, Math.round((awayProb * underProb) / 100 * 0.95));

  let comboMarkets = [
    { label: `${homeTeam.toUpperCase()} & OVER ${totalLine} ${lineUnit}`, val: hOver },
    { label: `${homeTeam.toUpperCase()} & UNDER ${totalLine} ${lineUnit}`, val: hUnder },
    { label: `${awayTeam.toUpperCase()} & OVER ${totalLine} ${lineUnit}`, val: aOver },
    { label: `${awayTeam.toUpperCase()} & UNDER ${totalLine} ${lineUnit}`, val: aUnder }
  ];

  if (drawProb > 0) {
    const dOver = Math.min(85, Math.round((drawProb * overProb) / 100 * 1.15));
    const dUnder = Math.min(85, Math.round((drawProb * underProb) / 100 * 0.88));
    comboMarkets.push({ label: `DRAW & OVER ${totalLine} ${lineUnit}`, val: dOver });
    comboMarkets.push({ label: `DRAW & UNDER ${totalLine} ${lineUnit}`, val: dUnder });
  }

  // Combine all market options to find top pick
  const allMarkets = [...stdMarkets, ...comboMarkets].sort((a, b) => b.val - a.val);
  const topPick = allMarkets[0];
  const passedFilter = topPick.val >= autoThreshold;

  res.status(200).json({
    autoThreshold,
    bestPick: {
      title: passedFilter ? topPick.label : 'NO BET / PASS',
      confidence: topPick.val,
      passedFilter,
      desc: passedFilter 
        ? `Highest confidence edge found at ${topPick.val}%.`
        : `Top edge was ${topPick.val}%, falling below the ${autoThreshold}% safety cutoff.`
    },
    projection: { homeGoals: homeExp, awayGoals: awayExp },
    stdMarkets,
    comboMarkets
  });
}
