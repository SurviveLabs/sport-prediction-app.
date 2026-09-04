const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Root test endpoint
app.get('/', (req, res) => {
  res.send('Prediction Engine API is running live 24/7.');
});

// Example Prediction Logic Endpoint
app.post('/api/predict', (req, res) => {
  const { homeTeam, awayTeam, homeAvg, awayAvg } = req.body;

  // Simple Poisson/Expected Goals calculation concept
  const expectedHomeGoals = Number(homeAvg) || 1.5;
  const expectedAwayGoals = Number(awayAvg) || 1.1;

  res.json({
    match: `${homeTeam || 'Home'} vs ${awayTeam || 'Away'}`,
    predictions: {
      expectedGoalsHome: expectedHomeGoals.toFixed(2),
      expectedGoalsAway: expectedAwayGoals.toFixed(2),
      totalExpectedGoals: (expectedHomeGoals + expectedAwayGoals).toFixed(2),
      recommendedTip: (expectedHomeGoals + expectedAwayGoals) > 2.5 ? "Over 2.5 Goals" : "Under 2.5 Goals"
    }
  });
});

module.exports = app;

