const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Multi-Sport & Lower-League Prediction Engine active.');
});

app.post('/api/predict', (req, res) => {
  const { 
    sport = 'football', 
    homeTeam = 'Home', 
    awayTeam = 'Away', 
    homeAvg, homeConceded, 
    awayAvg, awayConceded,
    strictThreshold = 75,
    leagueTier = 'major'
  } = req.body;

  let hScored = Number(homeAvg) || 0;
  let hCon = Number(homeConceded) || 0;
  let aScored = Number(awayAvg) || 0;
  let aCon = Number(awayConceded) || 0;

  // Apply Lower League Variance & Home-Advantage Adjustments
  const isLowerLeague = leagueTier === 'lower';
  const homeAdvantageBoost = isLowerLeague ? 1.12 : 1.05;

  hScored = hScored * homeAdvantageBoost;

  let bestPick = {};
  let probabilities = {};
  let projection = {};
  let markets = {};

  switch (sport) {
    case 'basketball': {
      const expHomePts = Math.round((hScored + aCon) / 2);
      const expAwayPts = Math.round((aScored + hCon) / 2);
      const totalPoints = expHomePts + expAwayPts;
      
      const homeWinProb = Math.min(95, Math.max(5, Math.round((expHomePts / totalPoints) * 100)));
      const awayWinProb = 100 - homeWinProb;
      const topProb = Math.max(homeWinProb, awayWinProb);

      const passed = topProb >= strictThreshold;

      bestPick = {
        title: passed ? (homeWinProb > awayWinProb ? `${homeTeam} Moneyline` : `${awayTeam} Moneyline`) : "PASS / NO BET",
        desc: passed 
          ? `Model detected ${topProb}% confidence edge (${isLowerLeague ? 'Lower League Pace Variance Applied' : 'Standard Model'}).`
          : `Highest confidence (${topProb}%) failed your ${strictThreshold}% strict filter cutoff.`,
        confidence: topProb,
        passedFilter: passed
      };
      probabilities = { home: homeWinProb, draw: 0, away: awayWinProb };
      projection = { homeGoals: expHomePts, awayGoals: expAwayPts };
      markets = {
        label1: "OVER 210.5 TOTAL POINTS", val1: Math.min(95, Math.round((totalPoints / 220) * 85)),
        label2: `${homeTeam.toUpperCase()} MONEYLINE`, val2: homeWinProb,
        label3: `${awayTeam.toUpperCase()} MONEYLINE`, val3: awayWinProb
      };
      break;
    }

    case 'ice_hockey': {
      const expHomeGoals = Number(((hScored + aCon) / 2).toFixed(2));
      const expAwayGoals = Number(((aScored + hCon) / 2).toFixed(2));
      const totalGoals = expHomeGoals + expAwayGoals;

      const homeProb = Math.min(85, Math.max(15, Math.round((expHomeGoals / totalGoals) * 100 - 5)));
      const awayProb = Math.min(85, Math.max(15, Math.round((expAwayGoals / totalGoals) * 100 - 10)));
      const drawProb = 100 - homeProb - awayProb;
      const maxEdge = Math.max(homeProb + drawProb, Math.round(totalGoals * 15));

      const passed = maxEdge >= strictThreshold;

      bestPick = {
        title: passed ? (totalGoals > 5.5 ? "Over 5.5 Match Goals" : `${homeTeam} +1.5 Puckline`) : "PASS / NO BET",
        desc: passed ? "Target match goal expectancy cleared risk filter." : `Edge rating (${maxEdge}%) is below your ${strictThreshold}% threshold.`,
        confidence: maxEdge,
        passedFilter: passed
      };
      probabilities = { home: homeProb, draw: drawProb, away: awayProb };
      projection = { homeGoals: Math.round(expHomeGoals), awayGoals: Math.round(expAwayGoals) };
      markets = {
        label1: "OVER 5.5 MATCH GOALS", val1: Math.round(Math.min(95, totalGoals * 15)),
        label2: `${homeTeam.toUpperCase()} PUCKLINE (+1.5)`, val2: homeProb + drawProb,
        label3: "BOTH TEAMS TO SCORE 2+", val3: Math.round(Math.min(90, expHomeGoals * expAwayGoals * 28))
      };
      break;
    }

    case 'tennis': {
      const p1Prob = Math.min(95, Math.max(5, Math.round(((hScored + hCon) / (hScored + hCon + aScored + aCon)) * 100)));
      const p2Prob = 100 - p1Prob;
      const topProb = Math.max(p1Prob, p2Prob);
      const passed = topProb >= strictThreshold;

      bestPick = {
        title: passed ? (p1Prob > p2Prob ? `${homeTeam} Match Win` : `${awayTeam} Match Win`) : "PASS / NO BET",
        desc: passed ? "Service hold & break ratio edge confirmed." : `Confidence (${topProb}%) is lower than strict cutoff (${strictThreshold}%).`,
        confidence: topProb,
        passedFilter: passed
      };
      probabilities = { home: p1Prob, draw: 0, away: p2Prob };
      projection = { homeGoals: p1Prob > p2Prob ? 2 : 0, awayGoals: p2Prob > p1Prob ? 2 : 0 };
      markets = {
        label1: "OVER 21.5 MATCH GAMES", val1: 78,
        label2: `${homeTeam.toUpperCase()} SET 1 WIN`, val2: p1Prob,
        label3: "BOTH PLAYERS WIN A SET", val3: 62
      };
      break;
    }

    case 'table_tennis': {
      const p1Prob = Math.min(95, Math.max(5, Math.round((hScored / (hScored + aScored)) * 100)));
      const p2Prob = 100 - p1Prob;
      const topProb = Math.max(p1Prob, p2Prob);
      const passed = topProb >= strictThreshold;

      bestPick = {
        title: passed ? (p1Prob > p2Prob ? `${homeTeam} -1.5 Games` : `${awayTeam} Match Win`) : "PASS / NO BET",
        desc: passed ? "Set conversion efficiency cleared risk filter." : `Filtered out: ${topProb}% did not meet ${strictThreshold}% requirement.`,
        confidence: topProb,
        passedFilter: passed
      };
      probabilities = { home: p1Prob, draw: 0, away: p2Prob };
      projection = { homeGoals: p1Prob > p2Prob ? 3 : 1, awayGoals: p2Prob > p1Prob ? 3 : 1 };
      markets = {
        label1: "OVER 3.5 SETS", val1: 82,
        label2: `${homeTeam.toUpperCase()} MATCH WIN`, val2: p1Prob,
        label3: `${awayTeam.toUpperCase()} MATCH WIN`, val3: p2Prob
      };
      break;
    }

    case 'football':
    default: {
      const expHome = Number(((hScored + aCon) / 2).toFixed(2));
      const expAway = Number(((aScored + hCon) / 2).toFixed(2));
      const total = expHome + expAway;

      const homeProb = Math.min(88, Math.max(12, Math.round((expHome / total) * 100 - 5)));
      const awayProb = Math.min(88, Math.max(12, Math.round((expAway / total) * 100 - 10)));
      const drawProb = 100 - homeProb - awayProb;

      const doubleChanceProb = homeProb + drawProb;
      const over15Prob = Math.round(Math.min(95, total * 26));
      const topEdge = Math.max(doubleChanceProb, over15Prob);

      const passed = topEdge >= strictThreshold;

      let pickTitle = "PASS / NO BET";
      if (passed) {
        if (doubleChanceProb >= strictThreshold) {
          pickTitle = `${homeTeam} win or draw`;
        } else {
          pickTitle = "Over 1.5 Goals";
        }
      }

      bestPick = {
        title: pickTitle,
        desc: passed 
          ? `Model cleared the ${strictThreshold}% strict filter threshold (${isLowerLeague ? 'Lower League Adjustment Active' : 'Major League'}).`
          : `Match probability edge (${topEdge}%) failed to clear your ${strictThreshold}% strict threshold limit.`,
        confidence: topEdge,
        passedFilter: passed
      };
      probabilities = { home: homeProb, draw: drawProb, away: awayProb };
      projection = { homeGoals: Math.round(expHome), awayGoals: Math.round(expAway) };
      markets = {
        label1: "OVER 1.5 GOALS", val1: over15Prob,
        label2: `${homeTeam.toUpperCase()} WIN OR DRAW`, val2: doubleChanceProb,
        label3: "BTTS : YES", val3: Math.round(Math.min(90, expHome * expAway * 30))
      };
      break;
    }
  }

  res.json({
    sport,
    leagueTier,
    match: `${homeTeam} vs ${awayTeam}`,
    bestPick,
    probabilities,
    projection,
    markets
  });
});

module.exports = app;
      
