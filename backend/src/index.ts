import dotenv from 'dotenv';
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import enhanceRouter from './routes/enhance';
import paymentsRouter from './routes/payments';

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Rate limitery
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 10,
    message: { error: 'Příliš mnoho uploadů, zkuste to za chvíli.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const paymentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hodina
    max: 20,
    message: { error: 'Příliš mnoho pokusů o platbu, zkuste to za chvíli.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

app.use('/api/enhance/upload', uploadLimiter);
app.use('/api/payments/create-checkout', paymentLimiter);

app.use('/api/enhance', enhanceRouter);
app.use('/api/payments', paymentsRouter);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Backend běží na http://localhost:${PORT}`);
});