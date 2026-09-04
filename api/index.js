const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Multi-Sport Prediction API is live.');
});

app.post('/api/predict', (req, res) => {
  const { sport = 'football', homeTeam, awayTeam, homeAvg, homeConceded, awayAvg, awayConceded } = req.body;

  const hScored = Number(homeAvg) || 0;
  const hCon = Number(homeConceded) || 0;
  const aScored = Number(awayAvg) || 0;
  const aCon = Number(awayConceded) || 0;

  let projectedMetric = "";
  let recommendedTip = "";

  switch (sport) {
    case 'basketball': {
      const expHomePts = (hScored + aCon) / 2;
      const expAwayPts = (aScored + hCon) / 2;
      const totalPoints = expHomePts + expAwayPts;
      projectedMetric = `${expHomePts.toFixed(1)} - ${expAwayPts.toFixed(1)} (Total: ${totalPoints.toFixed(1)})`;
      recommendedTip = totalPoints > 210 ? "Over 210.5 Total Points" : "Under 210.5 Total Points";
      break;
    }
    case 'ice_hockey': {
      const expHomeHockey = (hScored + aCon) / 2;
      const expAwayHockey = (aScored + hCon) / 2;
      const totalHockey = expHomeHockey + expAwayHockey;
      projectedMetric = `${expHomeHockey.toFixed(2)} - ${expAwayHockey.toFixed(2)} (Total: ${totalHockey.toFixed(2)})`;
      recommendedTip = totalHockey > 5.5 ? "Over 5.5 Goals" : "Under 5.5 Goals";
      break;
    }
    case 'tennis': {
      const p1Rating = hScored + hCon; // Hold + Break
      const p2Rating = aScored + aCon;
      projectedMetric = `Rating: P1 (${p1Rating.toFixed(1)}) vs P2 (${p2Rating.toFixed(1)})`;
      recommendedTip = p1Rating > p2Rating ? `${homeTeam || 'Player 1'} to Win` : `${awayTeam || 'Player 2'} to Win`;
      break;
    }
    case 'table_tennis': {
      const p1Edge = hScored - aScored;
      projectedMetric = `Win Probability Edge: ${p1Edge > 0 ? '+' : ''}${p1Edge.toFixed(1)}%`;
      recommendedTip = p1Edge > 0 ? `${homeTeam || 'P1'} Match Handicap (-1.5)` : `${awayTeam || 'P2'} Moneyline Win`;
      break;
    }
    case 'football':
    default: {
      const expHomeGoals = (hScored + aCon) / 2;
      const expAwayGoals = (aScored + hCon) / 2;
      const totalGoals = expHomeGoals + expAwayGoals;
      projectedMetric = `${expHomeGoals.toFixed(2)} - ${expAwayGoals.toFixed(2)} (Total: ${totalGoals.toFixed(2)})`;
      recommendedTip = totalGoals > 2.5 ? "Over 2.5 Goals" : "Under 2.5 Goals";
      break;
    }
  }

  res.json({
    sport,
    match: `${homeTeam || 'Home'} vs ${awayTeam || 'Away'}`,
    predictions: {
      projectedMetric,
      recommendedTip
    }
  });
});

module.exports = app;
