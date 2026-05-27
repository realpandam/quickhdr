import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { getUolService, UolContactInput } from './uol.service';

const resend          = new Resend(process.env.RESEND_API_KEY!);
const GOPAY_RETURN_URL = process.env.GOPAY_RETURN_URL || 'https://fasthdr.cz';
const BACKEND_URL     = process.env.BACKEND_URL       || 'https://api.fasthdr.cz';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  image_id: string;
  filename: string | null;
  user_id: string | null;
  email: string | null;
  payment_status: string;
  gopay_payment_id: string | null;
  amount_czk: number | null;
  wants_invoice: boolean;
  billing_name: string | null;
  billing_ico: string | null;
  billing_dic: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_country: string;
  uol_contact_id: string | null;
  uol_invoice_id: string | null;
  uol_invoice_attempts: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emailToExternalId(prefix: string, email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
  return `${prefix}u_${hash}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

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

// ─── Email zákazníka — získání s fallback na Supabase Auth ────────────────────

async function resolveCustomerEmail(order: OrderRow): Promise<string> {
  // 1. Email přímo v order (nepřihlášený uživatel)
  if (order.email) return order.email;

  // 2. Přihlášený uživatel — email vždy v Supabase Auth (Google OAuth i email/password)
  if (order.user_id) {
    const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
    const email = userData?.user?.email;
    if (email) return email;

    // 3. Fallback — user_identities (Google OAuth ukládá email i sem)
    const identityEmail = userData?.user?.identities?.[0]?.identity_data?.email;
    if (identityEmail) return identityEmail;
  }

  return '';
}

// ─── Email s fakturou ─────────────────────────────────────────────────────────

async function sendInvoiceReadyEmail(
  customerEmail: string,
  order: OrderRow,
  invoiceId: string,
  totalAmount: number,
  orderCount: number
): Promise<void> {
  const year        = new Date().getFullYear();
  const invoiceUrl  = `${BACKEND_URL}/api/billing/invoice/${order.image_id}`;
  const isMulti     = orderCount > 1;

  const recipientName = order.wants_invoice && order.billing_name
    ? order.billing_name
    : customerEmail.split('@')[0];

  const itemRow = isMulti
    ? `<tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:160px;">Položky</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${orderCount} fotografií</td></tr>`
    : `<tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:160px;">Položka</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">Úprava fotografie — ${order.filename ?? 'fotografie'}</td></tr>`;

  await resend.emails.send({
    from:    process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
    to:      customerEmail,
    subject: `Faktura č. ${invoiceId} — FastHDR`,
    html: `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Faktura č. ${invoiceId} — FastHDR</title>
</head>
<body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

    <tr>
      <td align="center" style="padding:0 0 32px;">
        <img src="${GOPAY_RETURN_URL}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;">
      </td>
    </tr>

    <tr>
      <td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#0D1F3C;border:1px solid #1E3A5F;border-radius:24px;padding:8px 16px;">
              <span style="font-size:12px;font-weight:600;color:#60A5FA;letter-spacing:0.5px;text-transform:uppercase;">📄 Faktura připravena</span>
            </td>
          </tr>
        </table>

        <h1 style="font-size:28px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
          Vaše faktura č. ${invoiceId}
        </h1>
        <p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">
          Dobrý den, <strong style="color:#ffffff;">${recipientName}</strong>,<br>
          níže najdete daňový doklad za ${isMulti ? `${orderCount} fotografie` : 'úpravu fotografie'} přes FastHDR.cz.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
          <tr>
            <td style="background:#7B5CF0;border-radius:10px;">
              <a href="${invoiceUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                📄 Stáhnout fakturu PDF →
              </a>
            </td>
          </tr>
        </table>

        <div style="height:1px;background:#22222E;margin:0 0 24px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;width:160px;">Číslo faktury</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${invoiceId}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Datum vystavení</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${todayIso()}</td>
          </tr>
          ${itemRow}
          ${order.wants_invoice && order.billing_ico ? `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">IČO</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${order.billing_ico}</td>
          </tr>` : ''}
          ${order.wants_invoice && order.billing_dic ? `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">DIČ</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${order.billing_dic}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Celková částka</td>
            <td style="padding:8px 0;font-size:15px;color:#4ADE80;font-weight:700;">${totalAmount} Kč</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Způsob platby</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">Platební karta (GoPay)</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Stav</td>
            <td style="padding:8px 0;font-size:13px;color:#4ADE80;font-weight:500;">Zaplaceno</td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:24px 32px 0;">
        <p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">
          Potřebujete pomoc? Napište nám na
          <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;">info@fasthdr.cz</a>
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:32px 32px 16px;">
        <div style="border-top:1px solid #16161F;padding-top:24px;">
          <p style="font-size:11px;line-height:1.7;color:#555568;margin:0;text-align:center;">
            <strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>
            Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br>
            <a href="${GOPAY_RETURN_URL}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a> ·
            <a href="${GOPAY_RETURN_URL}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a> ·
            <a href="${GOPAY_RETURN_URL}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a>
          </p>
          <p style="font-size:11px;color:#444455;margin:12px 0 0;text-align:center;">© ${year} FASTHDR. Všechna práva vyhrazena.</p>
        </div>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`,
  });
}

// ─── Hlavní funkce — jedna faktura per gopay_payment_id ───────────────────────

/**
 * Vytvoří UOL fakturu pro platbu.
 * - Jeden gopay_payment_id = jedna faktura (i pro batch více fotek)
 * - Faktura se vystaví na primární order (první v batchi)
 * - Ostatní orders v batchi dostanou stejné uol_invoice_id
 * - Email s fakturou se pošle až po úspěšném vystavení v UOL
 */
export async function createInvoiceForOrder(orderId: string): Promise<void> {
  if (process.env.UOL_INVOICING_ENABLED !== 'true') return;

  const uol           = getUolService();
  const prefix        = process.env.UOL_EXTERNAL_ID_PREFIX ?? 'fh_';
  const priceFallback = parseInt(process.env.PRICE_CZK ?? '25');

  // 1. Načti order
  const { data: order, error: fetchErr } = await supabase
    .from('orders').select('*').eq('id', orderId).single<OrderRow>();

  if (fetchErr || !order) {
    console.error(`[Invoice] Order ${orderId} nenalezen:`, fetchErr?.message);
    return;
  }

  if (order.payment_status !== 'paid') return;

  // 2. Idempotence — tento order už má fakturu
  if (order.uol_invoice_id) return;

  if (order.uol_invoice_attempts >= 5) {
    console.error(`[Invoice] Order ${orderId} — překročen max. počet pokusů`);
    return;
  }

  // 3. Načti všechny orders se stejným gopay_payment_id (batch platba)
  //    Pokud nemá gopay_payment_id, zpracuj jen tento order
  let batchOrders: OrderRow[] = [order];
  if (order.gopay_payment_id) {
    const { data: siblings } = await supabase
      .from('orders')
      .select('*')
      .eq('gopay_payment_id', order.gopay_payment_id)
      .eq('payment_status', 'paid')
      .returns<OrderRow[]>();

    if (siblings && siblings.length > 0) {
      batchOrders = siblings;
    }

    // Pokud jiný order v batchi už má fakturu → zkopíruj invoice_id na tento order a konec
    const alreadyInvoiced = batchOrders.find(o => o.id !== orderId && o.uol_invoice_id);
    if (alreadyInvoiced) {
      console.log(`[Invoice] Batch faktura ${alreadyInvoiced.uol_invoice_id} existuje → kopíruji na order ${orderId}`);
      await supabase.from('orders').update({
        uol_invoice_id:      alreadyInvoiced.uol_invoice_id,
        uol_contact_id:      alreadyInvoiced.uol_contact_id,
        uol_invoice_sent_at: new Date().toISOString(),
        uol_invoice_error:   null,
      }).eq('id', orderId);
      return;
    }

    // Pokud tento order není první v batchi (dle created_at) → přeskočit, zpracuje ho primární
    const primaryOrder = batchOrders.sort((a, b) =>
      new Date(a.created_at as unknown as string).getTime() - new Date(b.created_at as unknown as string).getTime()
    )[0];
    if (primaryOrder.id !== orderId) {
      console.log(`[Invoice] Order ${orderId} není primární v batchi → přeskakuji`);
      return;
    }
  }

  // 4. Idempotence — UOL check
  const existingInvoiceId = await uol.findInvoiceByExternalId(orderId);
  if (existingInvoiceId) {
    await Promise.all(batchOrders.map(o =>
      supabase.from('orders').update({
        uol_invoice_id:      existingInvoiceId,
        uol_invoice_sent_at: new Date().toISOString(),
        uol_invoice_error:   null,
      }).eq('id', o.id)
    ));
    return;
  }

  // Zvyš počítadlo jen na primárním orderu
  await supabase.from('orders')
    .update({ uol_invoice_attempts: order.uol_invoice_attempts + 1 })
    .eq('id', orderId);

  try {
    // 5. Získej email zákazníka — robustní fallback přes Supabase Auth
    const customerEmail = await resolveCustomerEmail(order);
    if (!customerEmail) {
      await supabase.from('orders').update({ uol_invoice_error: 'Chybí email zákazníka' }).eq('id', orderId);
      return;
    }

    // 6. Fakturační údaje — z primárního orderu
    const extId = emailToExternalId(prefix, customerEmail);
    let uolContactId = await getCachedContact(
      customerEmail,
      order.wants_invoice ? (order.billing_ico ?? undefined) : undefined
    );

    if (!uolContactId) {
      const contactInput: UolContactInput = {
        name:        order.wants_invoice && order.billing_name
          ? order.billing_name
          : customerEmail.split('@')[0] ?? 'Zákazník',
        email:       customerEmail,
        external_id: extId,
        country_id:  order.billing_country ?? 'CZ',
        ...(order.wants_invoice && order.billing_ico    && { company_number: order.billing_ico }),
        ...(order.wants_invoice && order.billing_dic    && { vatin:          order.billing_dic }),
        ...(order.wants_invoice && order.billing_street && { street:         order.billing_street }),
        ...(order.wants_invoice && order.billing_city   && { city:           order.billing_city }),
        ...(order.wants_invoice && order.billing_zip    && { postal_code:    order.billing_zip }),
      };
      uolContactId = await uol.findOrCreateContact(contactInput);
      await cacheContact(customerEmail, order.wants_invoice ? (order.billing_ico ?? null) : null, uolContactId);
    }

    // 7. Celková částka za batch
    const totalAmount = batchOrders.reduce((sum, o) => sum + (o.amount_czk ?? priceFallback), 0);

    // 8. Vytvoř fakturu v UOL (jedna za celý batch)
    const invoice = await uol.createInvoice({
      buyer_id:         uolContactId,
      order_id:         orderId,         // external_id odvozeno z primárního order_id
      gopay_payment_id: order.gopay_payment_id ?? 'unknown',
      amount_czk:       totalAmount,
      customer_email:   customerEmail,
      issue_date:       todayIso(),
    });

    // 9. Ulož invoice_id na všechny orders v batchi
    await Promise.all(batchOrders.map(o =>
      supabase.from('orders').update({
        uol_contact_id:      uolContactId,
        uol_invoice_id:      invoice.invoice_id,
        uol_invoice_sent_at: new Date().toISOString(),
        uol_invoice_error:   null,
      }).eq('id', o.id)
    ));

    console.log(`[Invoice] ✅ Batch faktura ${invoice.invoice_id} pro ${batchOrders.length} order(ů) — ${orderId}`);

    // 10. Pošli email s fakturou až teď, kdy je UOL potvrdil
    try {
      await sendInvoiceReadyEmail(customerEmail, order, invoice.invoice_id, totalAmount, batchOrders.length);
      console.log(`[Invoice] 📧 Faktura email → ${customerEmail}`);
    } catch (emailErr) {
      console.warn('[Invoice] Email selhal:', (emailErr as Error).message);
    }

  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`[Invoice] ❌ Order ${orderId}:`, message);
    await supabase.from('orders').update({ uol_invoice_error: message }).eq('id', orderId);
  }
}

// ─── Retry cron ───────────────────────────────────────────────────────────────

export async function retryFailedInvoices(): Promise<{ processed: number; failed: number }> {
  if (process.env.UOL_INVOICING_ENABLED !== 'true') return { processed: 0, failed: 0 };

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id')
    .eq('payment_status', 'paid')
    .is('uol_invoice_id', null)
    .lt('uol_invoice_attempts', 5)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !orders?.length) return { processed: 0, failed: 0 };

  let processed = 0, failed = 0;
  for (const { id } of orders) {
    try {
      await createInvoiceForOrder(id);
      processed++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return { processed, failed };
}