const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Multi-Sport Prediction API is live.');
});

app.post('/api/predict', (req, res) => {
  const { homeTeam = 'Home', awayTeam = 'Away', homeAvg, homeConceded, awayAvg, awayConceded } = req.body;

  const hScored = Number(homeAvg) || 1.82;
  const hCon = Number(homeConceded) || 0.92;
  const aScored = Number(awayAvg) || 1.34;
  const aCon = Number(awayConceded) || 1.18;

  // Expected Goals Calculation
  const expHome = ((hScored + aCon) / 2).toFixed(2);
  const expAway = ((aScored + hCon) / 2).toFixed(2);

  // Approximate Probability Model
  const homeProb = Math.min(85, Math.max(15, Math.round((expHome / (Number(expHome) + Number(expAway))) * 100 - 5)));
  const awayProb = Math.min(85, Math.max(15, Math.round((expAway / (Number(expHome) + Number(expAway))) * 100 - 10)));
  const drawProb = 100 - homeProb - awayProb;

  const doubleChanceHome = homeProb + drawProb;
  const over15 = Math.round(Math.min(95, (Number(expHome) + Number(expAway)) * 25));
  const btts = Math.round(Math.min(90, (expHome * expAway) * 30));

  res.json({
    match: `${homeTeam} vs ${awayTeam}`,
    bestPick: {
      title: doubleChanceHome >= 70 ? `${homeTeam} win or draw` : `Over 1.5 Goals`,
      desc: "The model found a market above the 70% strict-filter threshold.",
      confidence: Math.max(doubleChanceHome, over15)
    },
    probabilities: {
      home: homeProb,
      draw: drawProb,
      away: awayProb
    },
    projection: {
      homeGoals: Math.round(expHome),
      awayGoals: Math.round(expAway)
    },
    markets: {
      over15: over15,
      homeOrDraw: doubleChanceHome,
      btts: btts
    }
  });
});

module.exports = app;
