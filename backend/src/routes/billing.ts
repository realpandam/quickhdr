import { Request, Response, Router } from 'express';
import { supabase } from '../lib/supabase';
import { getUolService } from '../services/uol.service';

const router = Router();

// ─── IČO validace (modulo 11, CZ) ────────────────────────────────────────────

function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const d = ico.split('').map(Number);
  const sum = d.slice(0, 7).reduce((acc, v, i) => acc + v * (8 - i), 0);
  const rem = sum % 11;
  const check = rem === 0 ? 1 : rem === 1 ? 0 : 11 - rem;
  return check === d[7];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/save-details
// Uloží fakturační údaje před přesměrováním na GoPay
// ─────────────────────────────────────────────────────────────────────────────

router.post('/save-details', async (req: Request, res: Response) => {
  const {
    image_id,
    wants_invoice,
    billing_name,
    billing_ico,
    billing_dic,
    billing_street,
    billing_city,
    billing_zip,
    billing_country,
  } = req.body as Record<string, string | boolean | undefined>;

  if (!image_id) {
    res.status(400).json({ error: 'Chybí image_id' });
    return;
  }

  if (billing_ico && typeof billing_ico === 'string' && billing_ico.trim() !== '') {
    if (!isValidIco(billing_ico.trim())) {
      res.status(400).json({ error: 'Neplatné IČO — zkontrolujte prosím zadané číslo' });
      return;
    }
  }

  if (wants_invoice && !billing_name) {
    res.status(400).json({ error: 'Pro vystavení faktury je nutné vyplnit název firmy nebo jméno' });
    return;
  }

  const { error } = await supabase
    .from('orders')
    .update({
      wants_invoice:   Boolean(wants_invoice),
      billing_name:    (billing_name    as string | undefined) ?? null,
      billing_ico:     (billing_ico     as string | undefined)?.trim() ?? null,
      billing_dic:     (billing_dic     as string | undefined)?.trim() ?? null,
      billing_street:  (billing_street  as string | undefined) ?? null,
      billing_city:    (billing_city    as string | undefined) ?? null,
      billing_zip:     (billing_zip     as string | undefined) ?? null,
      billing_country: (billing_country as string | undefined) ?? 'CZ',
    })
    .eq('image_id', image_id)
    .eq('payment_status', 'pending');

  if (error) {
    console.error('[Billing] save-details error:', error.message);
    res.status(500).json({ error: 'Nepodařilo se uložit fakturační údaje' });
    return;
  }

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/invoice/:imageId
// Stáhne PDF faktury z UOL on-demand a vrátí zákazníkovi
// Toto je URL v emailovém tlačítku — bez autentizace (odkaz je dostatečně tajný)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/invoice/:imageId', async (req: Request, res: Response) => {
  const { imageId } = req.params;

  // Najdi order podle image_id
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, uol_invoice_id, payment_status, filename')
    .eq('image_id', imageId)
    .single<{ id: string; uol_invoice_id: string | null; payment_status: string; filename: string | null }>();

  if (error || !order) {
    res.status(404).json({ error: 'Objednávka nenalezena' });
    return;
  }

  if (order.payment_status !== 'paid') {
    res.status(402).json({ error: 'Faktura je dostupná až po zaplacení' });
    return;
  }

  if (!order.uol_invoice_id) {
    // Faktura ještě nebyla vystavena — může se stát pokud UOL nestihlo
    res.status(404).json({ error: 'Faktura se připravuje, zkuste prosím za chvíli' });
    return;
  }

  try {
    // Stáhni PDF přímo z UOL on-demand
    const uol       = getUolService();
    const pdfBuffer = await uol.downloadInvoicePdf(order.uol_invoice_id);

    const safeName  = order.filename
      ? order.filename.replace(/\.[^.]+$/, '')
      : order.uol_invoice_id;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="faktura_${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[Billing] PDF download error:', (err as Error).message);
    res.status(500).json({ error: 'Nepodařilo se stáhnout fakturu' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/retry/:imageId — manuální retry (chráněno CRON_SECRET)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/retry/:imageId', async (req: Request, res: Response) => {
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { imageId } = req.params;
  const { createInvoiceForOrder } = await import('../services/invoice.service');

  const { data: order, error } = await supabase
    .from('orders')
    .select('id')
    .eq('image_id', imageId)
    .single<{ id: string }>();

  if (error || !order) {
    res.status(404).json({ error: 'Objednávka nenalezena' });
    return;
  }

  try {
    await createInvoiceForOrder(order.id);
    res.json({ ok: true, message: `Fakturace pro ${imageId} spuštěna` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;