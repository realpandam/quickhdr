import dotenv from 'dotenv';
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

import express from 'express';
import cors from 'cors';
import enhanceRouter from './routes/enhance';
import paymentsRouter from './routes/payments';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));

// Webhook musí mít raw body — PŘED express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

app.use('/api/enhance', enhanceRouter);
app.use('/api/payments', paymentsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});