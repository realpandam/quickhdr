import { Request, Response, Router } from 'express';
import { sendExpiryReminders } from '../jobs/expiry-reminder';
import { retryFailedInvoices } from '../services/invoice.service';

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  return secret === process.env.CRON_SECRET;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/expiry-reminders
// Přesunuto sem z enhance.ts — stejná logika, jen jiná cesta.
// (Původní endpoint v enhance.ts lze smazat nebo nechat jako alias.)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/expiry-reminders', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    await sendExpiryReminders();
    res.json({ ok: true, job: 'expiry-reminders' });
  } catch (err) {
    console.error('[Cron] expiry-reminders selhal:', err);
    res.status(500).json({ error: 'Cron job selhal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/invoice-retry
// Zfakturuje zaplacené orders kde UOL fakturace předtím selhala.
// Spouštět každých 15 minut.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/invoice-retry', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const result = await retryFailedInvoices();
    console.log('[Cron] invoice-retry výsledek:', result);
    res.json({ ok: true, job: 'invoice-retry', ...result });
  } catch (err) {
    console.error('[Cron] invoice-retry selhal:', err);
    res.status(500).json({ error: 'Cron job selhal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/all
// Spustí všechny cron joby najednou — pro Railway single-schedule trigger.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/all', async (req: Request, res: Response) => {
  if (!isAuthorized(req)) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const results: Record<string, unknown> = {};

  // expiry-reminders
  try {
    await sendExpiryReminders();
    results.expiryReminders = { ok: true };
  } catch (err) {
    console.error('[Cron] expiry-reminders selhal:', err);
    results.expiryReminders = { ok: false, error: (err as Error).message };
  }

  // invoice-retry
  try {
    const invoiceResult = await retryFailedInvoices();
    results.invoiceRetry = { ok: true, ...invoiceResult };
  } catch (err) {
    console.error('[Cron] invoice-retry selhal:', err);
    results.invoiceRetry = { ok: false, error: (err as Error).message };
  }

  console.log('[Cron] /all výsledek:', results);
  res.json({ ok: true, results });
});

export default router;