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

  // Calculate sport-specific win probabilities and totals
  if (sport === 'football') {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(85, Math.max(15, Math.round(45 + diff * 20)));
    awayProb = Math.min(85, Math.max(15, Math.round(30 - diff * 20)));
    drawProb = 100 - homeProb - awayProb;
    totalLine = 2.5;
    lineUnit = "GOALS";

  } else if (sport === 'basketball') {
    homeExp = Math.round((hA + aC) / 2);
    awayExp = Math.round((aA + hC) / 2);
    const diff = homeExp - awayExp;

    homeProb = Math.min(92, Math.max(8, Math.round(50 + diff * 3)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = Math.round(homeExp + awayExp - 2.5);
    lineUnit = "POINTS";

  } else if (sport === 'american_football') {
    homeExp = Math.round((hA + aC) / 2);
    awayExp = Math.round((aA + hC) / 2);
    const diff = homeExp - awayExp;

    homeProb = Math.min(90, Math.max(10, Math.round(52 + diff * 3.5)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = Math.round(homeExp + awayExp - 2.5);
    lineUnit = "POINTS";

  } else if (sport === 'ice_hockey') {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(80, Math.max(20, Math.round(42 + diff * 18)));
    awayProb = Math.min(80, Math.max(20, Math.round(38 - diff * 18)));
    drawProb = 100 - homeProb - awayProb;
    totalLine = 5.5;
    lineUnit = "GOALS";

  } else if (sport === 'tennis' || sport === 'table_tennis') {
    homeExp = hA > aA ? 2 : 0;
    awayExp = hA > aA ? 0 : 2;
    const diff = hA - aA;

    homeProb = Math.min(90, Math.max(10, Math.round(50 + diff * 1.5)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = 2.5;
    lineUnit = "SETS";

  } else if (sport === 'cricket') {
    homeExp = Math.round((hA + (10 - aC) * 10) / 2);
    awayExp = Math.round((aA + (10 - hC) * 10) / 2);
    const diff = homeExp - awayExp;

    homeProb = Math.min(88, Math.max(12, Math.round(50 + diff * 0.8)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = Math.round(homeExp + awayExp - 15.5);
    lineUnit = "RUNS";

  } else if (sport === 'baseball') {
    homeExp = Math.round(((hA + aC) / 2) * 10) / 10;
    awayExp = Math.round(((aA + hC) / 2) * 10) / 10;
    const diff = homeExp - awayExp;

    homeProb = Math.min(78, Math.max(22, Math.round(50 + diff * 14)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = 8.5;
    lineUnit = "RUNS";

  } else if (sport === 'volleyball' || sport === 'esports') {
    homeExp = hA > aA ? 3 : 1;
    awayExp = hA > aA ? 1 : 3;
    const diff = hA - aA;

    homeProb = Math.min(92, Math.max(8, Math.round(50 + diff * 1.2)));
    awayProb = 100 - homeProb;
    drawProb = 0;
    totalLine = 2.5;
    lineUnit = sport === 'volleyball' ? "SETS" : "MAPS";
  }

  const overProb = 68;
  const underProb = 32;

  const hOver = Math.min(92, Math.round((homeProb * overProb) / 100 * 1.1));
  const hUnder = Math.min(88, Math.round((homeProb * underProb) / 100 * 0.95));
  const aOver = Math.min(92, Math.round((awayProb * overProb) / 100 * 1.1));
  const aUnder = Math.min(88, Math.round((awayProb * underProb) / 100 * 0.95));

  let marketList = [
    { label: `${homeTeam.toUpperCase()} & OVER ${totalLine} ${lineUnit}`, val: hOver },
    { label: `${homeTeam.toUpperCase()} & UNDER ${totalLine} ${lineUnit}`, val: hUnder },
    { label: `${awayTeam.toUpperCase()} & OVER ${totalLine} ${lineUnit}`, val: aOver },
    { label: `${awayTeam.toUpperCase()} & UNDER ${totalLine} ${lineUnit}`, val: aUnder }
  ];

  if (drawProb > 0) {
    const dOver = Math.min(85, Math.round((drawProb * overProb) / 100 * 1.15));
    const dUnder = Math.min(85, Math.round((drawProb * underProb) / 100 * 0.88));
    marketList.push({ label: `DRAW & OVER ${totalLine} ${lineUnit}`, val: dOver });
    marketList.push({ label: `DRAW & UNDER ${totalLine} ${lineUnit}`, val: dUnder });
  }

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
        ? `High-probability combo edge found at ${topPick.val}%.`
        : `Top combo edge was ${topPick.val}%, falling below the ${autoThreshold}% safety cutoff.`
    },
    probabilities: { home: homeProb, draw: drawProb, away: awayProb },
    projection: { homeGoals: homeExp, awayGoals: awayExp },
    comboMarkets: marketList
  });
}
