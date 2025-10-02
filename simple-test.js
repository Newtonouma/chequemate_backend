import express from 'express';

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Simple test server is working!' });
});

app.listen(3003, () => {
  console.log('🚀 Simple test server running on port 3003');
});
