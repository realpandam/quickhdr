import { Request, Response, Router } from 'express';
import { supabase } from '../lib/supabase';   // singleton, stejně jako v payments.ts
import { createInvoiceForOrder } from '../services/invoice.service';

const router = Router();

// ─── Helper: IČO validace (modulo 11, CZ) ────────────────────────────────────

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
// Uloží fakturační údaje před přesměrováním na GoPay.
// Volá frontend těsně před /api/payments/create-checkout.
// Vstup: image_id (stejný identifikátor jako v payments.ts, NE order UUID)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/save-details', async (req: Request, res: Response) => {
  const {
    image_id,           // identifikátor z frontendu (stejný jako v create-checkout)
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

  // Validace IČO pokud zadáno
  if (billing_ico && typeof billing_ico === 'string' && billing_ico.trim() !== '') {
    if (!isValidIco(billing_ico.trim())) {
      res.status(400).json({ error: 'Neplatné IČO — zkontrolujte prosím zadané číslo' });
      return;
    }
  }

  // Chce fakturu = jméno je povinné
  if (wants_invoice && !billing_name) {
    res.status(400).json({ error: 'Pro vystavení faktury je nutné vyplnit název firmy nebo jméno' });
    return;
  }

  // Update podle image_id — stejná logika jako v payments.ts (kde se taky updateuje přes image_id)
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
    .eq('payment_status', 'pending');   // jen pending — nezměníme zaplacené

  if (error) {
    console.error('[Billing] save-details error:', error.message);
    res.status(500).json({ error: 'Nepodařilo se uložit fakturační údaje' });
    return;
  }

  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/invoice/:imageId
// Vrátí signed URL pro stažení PDF faktury.
// Používá image_id (stejný jako jinde v API) — ne order UUID.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/invoice/:imageId', async (req: Request, res: Response) => {
  const { imageId } = req.params;

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, uol_invoice_id, uol_invoice_pdf_url, payment_status')
    .eq('image_id', imageId)
    .single<{
      id: string;
      uol_invoice_id: string | null;
      uol_invoice_pdf_url: string | null;
      payment_status: string;
    }>();

  if (error || !order) {
    res.status(404).json({ error: 'Objednávka nenalezena' });
    return;
  }

  if (order.payment_status !== 'paid') {
    res.status(402).json({ error: 'Faktura je dostupná až po zaplacení' });
    return;
  }

  if (!order.uol_invoice_id) {
    res.status(404).json({ error: 'Faktura ještě nebyla vystavena — zkuste prosím za chvíli' });
    return;
  }

  if (!order.uol_invoice_pdf_url) {
    res.status(404).json({ error: 'PDF faktury není k dispozici' });
    return;
  }

  // Signed URL platný 1 hodinu
  const storagePath = `invoices/${order.id}/${order.uol_invoice_id}.pdf`;
  const { data: signedData, error: signErr } = await supabase.storage
    .from('invoices')
    .createSignedUrl(storagePath, 3600);

  if (signErr || !signedData?.signedUrl) {
    // Fallback na public URL
    res.json({ url: order.uol_invoice_pdf_url, invoice_id: order.uol_invoice_id });
    return;
  }

  res.json({ url: signedData.signedUrl, invoice_id: order.uol_invoice_id });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/retry/:imageId
// Manuální retry fakturace — chráněno CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/retry/:imageId', async (req: Request, res: Response) => {
  const secret = req.headers['x-cron-secret'] ?? req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { imageId } = req.params;

  // Najdi order ID podle image_id
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