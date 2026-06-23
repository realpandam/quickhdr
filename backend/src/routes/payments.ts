import { Request, Response, Router } from 'express';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { createPayment, getPaymentStatus } from '../services/gopay.service';
import { createInvoiceForOrder } from '../services/invoice.service';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY!);

const GOPAY_RETURN_URL = process.env.GOPAY_RETURN_URL || 'https://fasthdr.cz';
const BACKEND_URL      = process.env.BACKEND_URL      || 'https://api.fasthdr.cz';
const PRICE_CZK        = parseInt(process.env.PRICE_CZK || '25');
const IS_MOCK          = process.env.GOPAY_MOCK === 'true' || process.env.NODE_ENV !== 'production';

// ─────────────────────────────────────────────
// POST /api/payments/create-checkout
// Podporuje single i multi platbu (image_ids[])
// ─────────────────────────────────────────────
router.post('/create-checkout', async (req: Request, res: Response) => {
    try {
        const { image_id, image_ids, filename, user_id, email } = req.body;

        if (!image_id) {
            res.status(400).json({ error: 'Chybí image_id' });
            return;
        }

        const allImageIds: string[] = image_ids && Array.isArray(image_ids) && image_ids.length > 0
            ? image_ids
            : [image_id];

        const { data: pendingOrders } = await supabase
            .from('orders')
            .select('image_id, amount_czk')
            .in('image_id', allImageIds)
            .eq('payment_status', 'pending');

        const ordersToCharge = pendingOrders ?? [];
        const totalAmount    = ordersToCharge.reduce((sum, o) => sum + (o.amount_czk ?? PRICE_CZK), 0) || PRICE_CZK;
        const orderId        = `ORDER-${image_id}-${Date.now()}`;
        const photoLabel     = ordersToCharge.length > 1
            ? `${ordersToCharge.length} fotografií`
            : (filename ?? 'fotografie');

        if (IS_MOCK) {
            const mockPaymentId = `MOCK-${Date.now()}`;
            await supabase.from('orders')
                .update({ gopay_order_id: orderId, gopay_payment_id: mockPaymentId, email: email || null })
                .in('image_id', allImageIds)
                .eq('payment_status', 'pending');

            res.json({ url: `${GOPAY_RETURN_URL}/success?image_id=${image_id}&gopay_id=${mockPaymentId}&mock=true` });
        } else {
            const payment = await createPayment({
                orderId,
                amount:      totalAmount,
                currency:    'CZK',
                email:       email || 'noreply@fasthdr.cz',
                description: `FASTHDR — ${photoLabel}`,
                returnUrl:   `${GOPAY_RETURN_URL}/success?image_id=${image_id}`,
                notifyUrl:   `${BACKEND_URL}/api/payments/notify`,
            });

            await supabase.from('orders')
                .update({ gopay_order_id: orderId, gopay_payment_id: String(payment.id), email: email || null })
                .in('image_id', allImageIds)
                .eq('payment_status', 'pending');

            res.json({ url: payment.gw_url });
        }
    } catch (error: any) {
        console.error('GoPay error:', JSON.stringify(error?.response?.data, null, 2));
        res.status(500).json({ error: 'Nepodařilo se vytvořit platbu' });
    }
});

// ─────────────────────────────────────────────
// GET /api/payments/verify/:paymentId
// Frontend volá po návratu z platební brány
// ─────────────────────────────────────────────
router.get('/verify/:paymentId', async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;

        if (paymentId.startsWith('MOCK-')) {
            const { data: orders } = await supabase.from('orders').select('*').eq('gopay_payment_id', paymentId);

            if (!orders || orders.length === 0) {
                res.status(404).json({ error: 'Objednávka nenalezena' });
                return;
            }

            await supabase.from('orders').update({ payment_status: 'paid' }).eq('gopay_payment_id', paymentId);

            for (const o of orders) {
                createInvoiceForOrder(o.id).catch(err =>
                    console.error('[Payments] Invoice selhala pro order', o.id, err)
                );
            }

            // MOCK: email posíláme zde, /notify se u mock nevolá
            const primaryOrder = orders[0];
            if (primaryOrder.email) {
                await sendConfirmationEmail(
                    primaryOrder.email,
                    primaryOrder.filename,
                    primaryOrder.image_id,
                    orders.length,
                    Boolean(primaryOrder.wants_invoice),
                );
            }

            res.json({ image_id: primaryOrder.image_id, paid: true, count: orders.length });
            return;
        }

        // GoPay ověření
        const { data: existingOrders } = await supabase.from('orders').select('*').eq('gopay_payment_id', paymentId);

        if (existingOrders && existingOrders.length > 0 && existingOrders.every(o => o.payment_status === 'paid')) {
            res.json({ image_id: existingOrders[0].image_id, paid: true, count: existingOrders.length });
            return;
        }

        const payment = await getPaymentStatus(paymentId);
        const isPaid  = ['PAID', 'AUTHORIZED', 'PAYMENT_METHOD_CHOSEN'].includes(payment.state);

        if (!isPaid) {
            res.status(402).json({ error: 'Platba nebyla dokončena', state: payment.state });
            return;
        }

        await supabase.from('orders').update({ payment_status: 'paid' }).eq('gopay_payment_id', paymentId);

        for (const o of existingOrders ?? []) {
            createInvoiceForOrder(o.id).catch(err =>
                console.error('[Payments] Invoice selhala pro order', o.id, err)
            );
        }

        const primaryOrder = existingOrders?.[0];
        res.json({ image_id: primaryOrder?.image_id, paid: true, count: existingOrders?.length ?? 1 });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Nepodařilo se ověřit platbu' });
    }
});

// ─────────────────────────────────────────────
// GET /api/payments/notify — GoPay webhook
// ─────────────────────────────────────────────
router.get('/notify', async (req: Request, res: Response) => {
    try {
        const paymentId = req.query.id as string;
        if (!paymentId) { res.status(400).send('Missing payment id'); return; }

        const payment = await getPaymentStatus(paymentId);

        if (payment.state === 'PAID') {
            const { data: orders } = await supabase.from('orders').select('*').eq('gopay_payment_id', paymentId);

            if (orders && orders.length > 0) {
                await supabase.from('orders').update({ payment_status: 'paid' }).eq('gopay_payment_id', paymentId);

                for (const o of orders) {
                    createInvoiceForOrder(o.id).catch(err =>
                        console.error('[Payments] Invoice selhala pro order', o.id, err)
                    );
                }

                const primaryOrder  = orders[0];
                const customerEmail = primaryOrder.email || payment.payer?.contact?.email;
                if (customerEmail) {
                    await sendConfirmationEmail(
                        customerEmail,
                        primaryOrder.filename,
                        primaryOrder.image_id,
                        orders.length,
                        Boolean(primaryOrder.wants_invoice),
                    );
                }
            }
        } else if (payment.state === 'REFUNDED' || payment.state === 'PARTIALLY_REFUNDED') {
            // Platba byla vrácena — zákazník ztratí přístup ke stažení
            const { data: orders } = await supabase
                .from('orders')
                .update({ payment_status: 'refunded' })
                .eq('gopay_payment_id', paymentId)
                .eq('payment_status', 'paid')
                .select('image_id');
            console.log(`[Payments] Refund ${payment.state} pro payment ${paymentId} — dotčeno ${orders?.length ?? 0} order(ů)`);
        } else if (payment.state === 'CANCELED' || payment.state === 'TIMEOUTED') {
            // Pokud byl order mylně označen jako paid (přes AUTHORIZED ve verify), přístupu odeber
            const { data: revokedOrders } = await supabase
                .from('orders')
                .update({ payment_status: 'canceled' })
                .eq('gopay_payment_id', paymentId)
                .eq('payment_status', 'paid')
                .select('image_id');
            // Ordery, které jsou stále pending, zůstanou pending — zákazník může zkusit znovu
            if (revokedOrders && revokedOrders.length > 0) {
                console.log(`[Payments] Payment ${paymentId} ${payment.state} — odebráno paid přes ${revokedOrders.length} order(ů) (AUTHORIZED→TIMEOUTED/CANCELED)`);
            } else {
                console.log(`[Payments] Payment ${paymentId} ${payment.state} — order pending, žádná akce`);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Notify error:', error);
        res.status(500).send('Error');
    }
});

// ─────────────────────────────────────────────
// Helper — potvrzovací email po platbě
// Faktura přijde zvlášť z invoice.service.ts až bude připravena v UOL
// ─────────────────────────────────────────────
async function sendConfirmationEmail(
    email: string,
    filename: string,
    imageId: string,
    count: number = 1,
    wantsInvoice: boolean = false
) {
    const isMulti  = count > 1;
    const safeName = filename ?? 'bez názvu';
    const safeRef  = filename ?? imageId;
    const year     = new Date().getFullYear();

    const subject = isMulti
        ? `Vaše fotografie jsou připraveny ke stažení (${count} fotek)`
        : 'Vaše fotografie je připravena ke stažení';

    const headingHtml = isMulti
        ? `Všech <strong style="color:#ffffff;">${count} fotografií</strong><br>je připraveno ke stažení`
        : `Vaše fotografie<br>je připravena ke stažení`;

    const descHtml = isMulti
        ? `Platba za <strong style="color:#ffffff;font-weight:600;">${count} fotografií</strong> proběhla úspěšně. Profesionálně upravené fotografie jsou nyní dostupné ke stažení v plném rozlišení.`
        : `Platba za soubor <strong style="color:#ffffff;font-weight:600;">${safeName}</strong> proběhla úspěšně. Profesionálně upravená fotografie je nyní dostupná ke stažení v plném rozlišení.`;

    const fileRowHtml = isMulti
        ? `<tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:140px;">Počet fotek</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${count} fotografií</td></tr>`
        : `<tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:140px;">Soubor</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;word-break:break-all;">${safeRef}</td></tr>`;

    try {
        await resend.emails.send({
            from:    process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
            to:      email,
            subject,
            html: `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject} — FastHDR</title>
</head>
<body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#09090F;">
Platba proběhla úspěšně. ${isMulti ? `${count} fotografií je připraveno ke stažení.` : `Vaše fotografie ${safeName} je připravena ke stažení.`}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

    <tr>
      <td align="center" style="padding:0 0 32px;">
        <img src="${GOPAY_RETURN_URL}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>

    <tr>
      <td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#0D2E1F;border:1px solid #1E5340;border-radius:24px;padding:8px 16px;">
              <span style="font-size:12px;font-weight:600;color:#4ADE80;letter-spacing:0.5px;text-transform:uppercase;">● Platba úspěšná</span>
            </td>
          </tr>
        </table>

        <h1 style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
          ${headingHtml}
        </h1>
        <p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">
          ${descHtml}
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
          <tr>
            <td style="background:#7B5CF0;border-radius:10px;">
              <a href="${GOPAY_RETURN_URL}/dashboard" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                ${isMulti ? 'Zobrazit fotografie →' : 'Stáhnout fotografii →'}
              </a>
            </td>
          </tr>
        </table>

        <div style="height:1px;background:#22222E;margin:0 0 24px;"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${fileRowHtml}
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Stav</td>
            <td style="padding:8px 0;font-size:13px;color:#4ADE80;font-weight:500;">Zaplaceno</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Dostupné po dobu</td>
            <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">7 dní</td>
          </tr>
          ${wantsInvoice ? `<tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Faktura</td>
            <td style="padding:8px 0;font-size:13px;color:#AAAABC;">Přijde samostatným emailem za chvíli</td>
          </tr>` : `<tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Doklad</td>
            <td style="padding:8px 0;font-size:13px;color:#AAAABC;">Toto potvrzení není daňovým dokladem</td>
          </tr>`}
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#8888A0;">Podpora</td>
            <td style="padding:8px 0;font-size:13px;">
              <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;font-weight:500;">info@fasthdr.cz</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:24px 32px 0;">
        <p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">
          💡 Tip: ${isMulti ? 'Fotografie si stáhněte včas' : 'Fotografii si stáhněte včas'} — po 7 dnech bude automaticky odstraněna z našich serverů.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:40px 32px 16px;">
        <div style="border-top:1px solid #16161F;padding-top:24px;">
          <p style="font-size:11px;line-height:1.7;color:#555568;margin:0;text-align:center;">
            <strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>
            Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br>
            <a href="${GOPAY_RETURN_URL}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a> ·
            <a href="${GOPAY_RETURN_URL}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a> ·
            <a href="${GOPAY_RETURN_URL}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a>
          </p>
          <p style="font-size:11px;color:#444455;margin:16px 0 0;text-align:center;">© ${year} FASTHDR. Všechna práva vyhrazena.</p>
        </div>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`,
        });
    } catch (err) {
        console.error('Chyba při odesílání emailu:', err);
    }
}

export default router;