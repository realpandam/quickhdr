import crypto from 'crypto';
import { supabase } from '../lib/supabase';  // singleton, stejně jako v payments.ts
import { getUolService, UolContactInput } from './uol.service';

// ─── Types (přesně odpovídají sloupcům v orders tabulce) ──────────────────────

interface OrderRow {
  id: string;
  image_id: string;
  filename: string | null;
  user_id: string | null;
  email: string | null;
  payment_status: string;           // 'pending' | 'paid'  (NE boolean paid!)
  gopay_payment_id: string | null;  // GoPay payment ID
  amount_czk: number | null;        // z DB, fallback PRICE_CZK
  // billing (přidáno migrací)
  wants_invoice: boolean;
  billing_name: string | null;
  billing_ico: string | null;
  billing_dic: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_country: string;
  // uol tracking (přidáno migrací)
  uol_contact_id: string | null;
  uol_invoice_id: string | null;
  uol_invoice_attempts: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministický external_id z emailu — neprozradí email do UOL logu */
function emailToExternalId(prefix: string, email: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 12);
  return `${prefix}u_${hash}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Cache helpers (uol_contacts tabulka) ────────────────────────────────────

async function getCachedContact(email: string, ico?: string): Promise<string | null> {
  const query = ico
    ? supabase.from('uol_contacts').select('uol_contact_id').eq('ico', ico).single()
    : supabase.from('uol_contacts').select('uol_contact_id').eq('email', email.toLowerCase()).single();

  const { data } = await query;
  return (data as { uol_contact_id: string } | null)?.uol_contact_id ?? null;
}

async function cacheContact(email: string, ico: string | null, uolContactId: string): Promise<void> {
  await supabase.from('uol_contacts').upsert(
    { email: email.toLowerCase(), ico: ico ?? null, uol_contact_id: uolContactId },
    { onConflict: 'email' }
  );
}

// ─── Hlavní funkce ────────────────────────────────────────────────────────────

/**
 * Vytvoří UOL fakturu pro jeden order.
 * Bezpečné pro fire & forget — nikdy nevyhazuje výjimku ven.
 * Idempotentní — lze volat vícekrát pro stejný order_id.
 */
export async function createInvoiceForOrder(orderId: string): Promise<void> {
  if (process.env.UOL_INVOICING_ENABLED !== 'true') return;

  const uol    = getUolService();
  const prefix = process.env.UOL_EXTERNAL_ID_PREFIX ?? 'fh_';
  const priceFallback = parseInt(process.env.PRICE_CZK ?? '25');

  // ── 1. Načti order ────────────────────────────────────────────────────────

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single<OrderRow>();

  if (fetchErr || !order) {
    console.error(`[Invoice] Order ${orderId} nenalezen:`, fetchErr?.message);
    return;
  }

  // ── 2. Guard: musí být zaplacen ───────────────────────────────────────────

  if (order.payment_status !== 'paid') {
    console.warn(`[Invoice] Order ${orderId} není paid (status: ${order.payment_status}) — přeskakuji`);
    return;
  }

  // ── 3. Idempotence — check v DB ───────────────────────────────────────────

  if (order.uol_invoice_id) {
    return;
  }

  // Max 5 pokusů
  if (order.uol_invoice_attempts >= 5) {
    console.error(`[Invoice] Order ${orderId} — překročen max. počet pokusů`);
    return;
  }

  // ── 4. Idempotence — check v UOL (pro případ pádu po create, před UPDATE) ─

  const existingInvoiceId = await uol.findInvoiceByExternalId(orderId);
  if (existingInvoiceId) {
    await supabase.from('orders').update({
      uol_invoice_id:      existingInvoiceId,
      uol_invoice_sent_at: new Date().toISOString(),
      uol_invoice_error:   null,
    }).eq('id', orderId);
    return;
  }

  // Zvyš počítadlo pokusů hned — ochrana před paralelním spuštěním
  await supabase.from('orders')
    .update({ uol_invoice_attempts: order.uol_invoice_attempts + 1 })
    .eq('id', orderId);

  try {
    // ── 5. Email zákazníka — stejná logika jako v payments.ts ────────────────

    let customerEmail = order.email ?? '';

    // Přihlášený uživatel bez emailu v order → dohledat přes Supabase Auth
    if (!customerEmail && order.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
      customerEmail = userData?.user?.email ?? '';
    }

    if (!customerEmail) {
      console.warn(`[Invoice] Order ${orderId} — neznámý email zákazníka, fakturu nelze vystavit`);
      await supabase.from('orders')
        .update({ uol_invoice_error: 'Chybí email zákazníka' })
        .eq('id', orderId);
      return;
    }

    // ── 6. Najdi nebo vytvoř UOL kontakt ─────────────────────────────────────

    const extId = emailToExternalId(prefix, customerEmail);

    // Zkus cache — šetří UOL API requesty
    let uolContactId = await getCachedContact(customerEmail, order.billing_ico ?? undefined);

    if (!uolContactId) {
      const contactInput: UolContactInput = {
        name:         order.billing_name ?? customerEmail.split('@')[0] ?? 'Zákazník',
        email:        customerEmail,
        external_id:  extId,
        country_id:   order.billing_country ?? 'CZ',
        // B2B pole — pouze pokud zákazník zaškrtl "Chci fakturu na firmu"
        ...(order.wants_invoice && order.billing_ico  && { company_number: order.billing_ico }),
        ...(order.wants_invoice && order.billing_dic  && { vatin:          order.billing_dic }),
        ...(order.wants_invoice && order.billing_street && { street:       order.billing_street }),
        ...(order.wants_invoice && order.billing_city   && { city:         order.billing_city }),
        ...(order.wants_invoice && order.billing_zip    && { postal_code:  order.billing_zip }),
      };

      uolContactId = await uol.findOrCreateContact(contactInput);
      await cacheContact(customerEmail, order.billing_ico ?? null, uolContactId);
    }

    // Ulož contact_id pro audit
    await supabase.from('orders')
      .update({ uol_contact_id: uolContactId })
      .eq('id', orderId);

    // ── 7. Vytvoř fakturu ─────────────────────────────────────────────────────

    const invoice = await uol.createInvoice({
      buyer_id:         uolContactId,
      order_id:         orderId,
      gopay_payment_id: order.gopay_payment_id ?? 'unknown',
      amount_czk:       order.amount_czk ?? priceFallback,
      customer_email:   customerEmail,
      issue_date:       todayIso(),
    });

    // ── 8. Stáhni PDF a ulož do Supabase Storage (záloha) ────────────────────

    let pdfUrl: string | null = null;
    try {
      const pdfBuffer  = await uol.downloadInvoicePdf(invoice.invoice_id);
      const storagePath = `invoices/${orderId}/${invoice.invoice_id}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from('invoices')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

      if (uploadErr) {
        console.warn(`[Invoice] PDF upload selhal: ${uploadErr.message}`);
      } else {
        const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(storagePath);
        pdfUrl = urlData?.publicUrl ?? null;
      }
    } catch (pdfErr) {
      // PDF záloha je nice-to-have — její selhání nesmí zrušit fakturaci
      console.warn('[Invoice] PDF download/upload selhal:', (pdfErr as Error).message);
    }

    // ── 9. Ulož výsledek ──────────────────────────────────────────────────────

    await supabase.from('orders').update({
      uol_invoice_id:      invoice.invoice_id,
      uol_invoice_pdf_url: pdfUrl,
      uol_invoice_sent_at: new Date().toISOString(),
      uol_invoice_error:   null,
    }).eq('id', orderId);


  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[Invoice] ❌ Order ${orderId} selhalo:`, message);
    await supabase.from('orders')
      .update({ uol_invoice_error: message })
      .eq('id', orderId);
    // Nevyhazujeme — fire & forget
  }
}

/**
 * Retry cron — najde zaplacené orders bez faktury a zfakturuje je.
 * Volat z existujícího cron endpointu chráněného CRON_SECRET.
 */
export async function retryFailedInvoices(): Promise<{ processed: number; failed: number }> {
  if (process.env.UOL_INVOICING_ENABLED !== 'true') return { processed: 0, failed: 0 };

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id')
    .eq('payment_status', 'paid')   // payment_status = 'paid', ne boolean
    .is('uol_invoice_id', null)
    .lt('uol_invoice_attempts', 5)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !orders?.length) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0, failed = 0;

  for (const { id } of orders) {
    try {
      await createInvoiceForOrder(id);
      processed++;
    } catch {
      failed++;
    }
    // Pauza — UOL rate limit je 30 req/10s
    await new Promise(r => setTimeout(r, 400));
  }

  return { processed, failed };
}