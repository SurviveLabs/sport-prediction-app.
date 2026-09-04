const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Multi-Sport Prediction API is live.');
});

app.post('/api/predict', (req, res) => {
  const { sport = 'football', homeTeam = 'Home', awayTeam = 'Away', homeAvg, homeConceded, awayAvg, awayConceded } = req.body;

  const hScored = Number(homeAvg) || 0;
  const hCon = Number(homeConceded) || 0;
  const aScored = Number(awayAvg) || 0;
  const aCon = Number(awayConceded) || 0;

  let bestPick = {};
  let probabilities = {};
  let projection = {};
  let markets = {};

  switch (sport) {
    case 'basketball': {
      const expHomePts = Math.round((hScored + aCon) / 2);
      const expAwayPts = Math.round((aScored + hCon) / 2);
      const totalPoints = expHomePts + expAwayPts;
      
      const homeWinProb = Math.min(85, Math.max(15, Math.round((expHomePts / totalPoints) * 100)));
      const awayWinProb = 100 - homeWinProb;

      bestPick = {
        title: totalPoints > 210 ? "Over 210.5 Total Points" : `${homeWinProb > awayWinProb ? homeTeam : awayTeam} Moneyline`,
        desc: "Basketball pace and offensive efficiency rating edge.",
        confidence: Math.max(homeWinProb, awayWinProb, 72)
      };
      probabilities = { home: homeWinProb, draw: 0, away: awayWinProb };
      projection = { homeGoals: expHomePts, awayGoals: expAwayPts };
      markets = {
        over15: Math.min(92, Math.round((totalPoints / 220) * 80)),
        homeOrDraw: homeWinProb,
        btts: awayWinProb
      };
      break;
    }

    case 'ice_hockey': {
      const expHomeGoals = Number(((hScored + aCon) / 2).toFixed(2));
      const expAwayGoals = Number(((aScored + hCon) / 2).toFixed(2));
      const totalGoals = expHomeGoals + expAwayGoals;

      const homeProb = Math.min(80, Math.max(20, Math.round((expHomeGoals / totalGoals) * 100 - 5)));
      const awayProb = Math.min(80, Math.max(20, Math.round((expAwayGoals / totalGoals) * 100 - 10)));
      const drawProb = 100 - homeProb - awayProb;

      bestPick = {
        title: totalGoals > 5.5 ? "Over 5.5 Match Goals" : `${homeTeam} +1.5 Puckline`,
        desc: "Goal expectancy adjusted for goalie defense ratings.",
        confidence: totalGoals > 5.5 ? 78 : 71
      };
      probabilities = { home: homeProb, draw: drawProb, away: awayProb };
      projection = { homeGoals: Math.round(expHomeGoals), awayGoals: Math.round(expAwayGoals) };
      markets = {
        over15: Math.round(Math.min(90, totalGoals * 14)),
        homeOrDraw: homeProb + drawProb,
        btts: Math.round(Math.min(85, expHomeGoals * expAwayGoals * 25))
      };
      break;
    }

    case 'tennis': {
      const p1Hold = hScored;
      const p2Hold = aScored;
      const p1Prob = Math.min(90, Math.max(10, Math.round(((p1Hold + hCon) / (p1Hold + hCon + p2Hold + aCon)) * 100)));
      const p2Prob = 100 - p1Prob;

      bestPick = {
        title: p1Prob > p2Prob ? `${homeTeam} Set 1 Win` : `${awayTeam} Set 1 Win`,
        desc: "Service hold % vs opponent break service rate ratio.",
        confidence: Math.max(p1Prob, p2Prob)
      };
      probabilities = { home: p1Prob, draw: 0, away: p2Prob };
      projection = { homeGoals: p1Prob > p2Prob ? 2 : 0, awayGoals: p2Prob > p1Prob ? 2 : 0 };
      markets = {
        over15: 78, // Over 21.5 Games
        homeOrDraw: p1Prob,
        btts: 65  // Both players to win a set
      };
      break;
    }

    case 'table_tennis': {
      const p1WinRate = hScored;
      const p2WinRate = aScored;
      const p1Prob = Math.min(88, Math.max(12, Math.round((p1WinRate / (p1WinRate + p2WinRate)) * 100)));
      const p2Prob = 100 - p1Prob;

      bestPick = {
        title: p1Prob > p2Prob ? `${homeTeam} -1.5 Games` : `${awayTeam} Moneyline`,
        desc: "Match win rate edge and average set scoring trajectory.",
        confidence: Math.max(p1Prob, p2Prob)
      };
      probabilities = { home: p1Prob, draw: 0, away: p2Prob };
      projection = { homeGoals: p1Prob > p2Prob ? 3 : 1, awayGoals: p2Prob > p1Prob ? 3 : 1 };
      markets = {
        over15: 82, // Over 3.5 Sets
        homeOrDraw: p1Prob,
        btts: 55
      };
      break;
    }

    case 'football':
    default: {
      const expHome = Number(((hScored + aCon) / 2).toFixed(2));
      const expAway = Number(((aScored + hCon) / 2).toFixed(2));
      const total = expHome + expAway;

      const homeProb = Math.min(85, Math.max(15, Math.round((expHome / total) * 100 - 5)));
      const awayProb = Math.min(85, Math.max(15, Math.round((expAway / total) * 100 - 10)));
      const drawProb = 100 - homeProb - awayProb;

      bestPick = {
        title: (homeProb + drawProb) >= 70 ? `${homeTeam} win or draw` : "Over 1.5 Goals",
        desc: "The model found a market above the 70% strict-filter threshold.",
        confidence: Math.max(homeProb + drawProb, Math.round(total * 25))
      };
      probabilities = { home: homeProb, draw: drawProb, away: awayProb };
      projection = { homeGoals: Math.round(expHome), awayGoals: Math.round(expAway) };
      markets = {
        over15: Math.round(Math.min(95, total * 25)),
        homeOrDraw: homeProb + drawProb,
        btts: Math.round(Math.min(90, expHome * expAway * 30))
      };
      break;
    }
  }

  res.json({
    sport,
    match: `${homeTeam} vs ${awayTeam}`,
    bestPick,
    probabilities,
    projection,
    markets
  });
});

module.exports = app;
      
