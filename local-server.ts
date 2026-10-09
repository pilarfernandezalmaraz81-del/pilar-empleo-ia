import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import analyzeOfferHandler from './api/ai/analyze-offer.ts';
import chatHandler from './api/ai/chat.ts';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3017;
const directory = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(directory, 'dist');

app.use(express.json({ limit: '2mb' }));
app.post('/api/ai/chat', (req, res) => {
  void chatHandler(req, res);
});
app.post('/api/ai/analyze-offer', (req, res) => {
  void analyzeOfferHandler(req, res);
});
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Pilar Empleo IA disponible en http://localhost:${port}`);
});
