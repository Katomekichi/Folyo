import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { bookingsRouter } from './routes/bookings';
import { requestsRouter } from './routes/requests';
import { settingsRouter } from './routes/settings';
import { publicRouter } from './routes/public';

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/public', publicRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Ledger API listening on http://localhost:${port}`);
});
