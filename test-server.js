import express from 'express';
import cors from 'cors';
import matchResultRoutes from './routes/matchResultRoutes.js';

const app = express();
const port = 3002; // Use a different port for testing

app.use(cors());
app.use(express.json());

// Mock io for testing
app.set('io', {
  to: (userId) => ({
    emit: (event, data) => {
      console.log(`🎉 Mock notification sent to user ${userId}:`, event, data);
    }
  })
});

app.use('/api/match-results', matchResultRoutes);

app.get('/test', (req, res) => {
  res.json({ message: 'Test server is running!' });
});

app.listen(port, () => {
  console.log(`🚀 Test server running on port ${port}`);
  console.log(`📍 Test endpoint: http://localhost:${port}/test`);
  console.log(`🎯 Match result endpoint: http://localhost:${port}/api/match-results/report-result`);
});
