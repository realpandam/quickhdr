import { Request, Response, Router } from 'express';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { createPayment, getPaymentStatus } from '../services/gopay.service';

console.log('Resend API key:', process.env.RESEND_API_KEY?.substring(0, 10) + '...');

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY!);

const PRICE_CZK = 59; // GoPay pracuje v celých korunách (haléře řeší service)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://quickhdr.cz';
const BACKEND_URL = process.env.BACKEND_URL || 'https://quickhdr-production.up.railway.app';

// ─────────────────────────────────────────────
// POST /api/payments/create-checkout
// Nahrazuje Stripe /create-checkout
// ─────────────────────────────────────────────
router.post('/create-checkout', async (req: Request, res: Response) => {
    try {
        const { image_id, filename, user_id, email, firstName, lastName } = req.body;

        if (!image_id) {
            res.status(400).json({ error: 'Chybí image_id' });
            return;
        }

        if (!email) {
            res.status(400).json({ error: 'Chybí email' });
            return;
        }

        const orderId = `ORDER-${image_id}-${Date.now()}`;

        // Vytvoř pending záznam v Supabase
        await supabase.from('orders').upsert({
            image_id,
            filename: filename ?? '',
            stripe_payment_status: 'pending', // zachováváme název sloupce pro kompatibilitu
            amount_czk: PRICE_CZK,
            user_id: user_id || null,
            gopay_order_id: orderId,
            email: email,
        });

        const payment = await createPayment({
            orderId,
            amount: PRICE_CZK,
            currency: 'CZK',
            email,
            firstName: firstName || '',
            lastName: lastName || '',
            description: `AI Retušování — ${filename ?? 'fotografie'}`,
            returnUrl: `${FRONTEND_URL}/success?image_id=${image_id}`,
            notifyUrl: `${BACKEND_URL}/api/payments/notify`,
        });

        // Ulož GoPay payment ID k objednávce
        await supabase
            .from('orders')
            .update({ gopay_payment_id: String(payment.id) })
            .eq('gopay_order_id', orderId);

        // Vrátí { url } — stejný interface jako Stripe checkout session
        res.json({ url: payment.gw_url });
    } catch (error) {
        console.error('Chyba při vytváření GoPay platby:', error);
        res.status(500).json({ error: 'Nepodařilo se vytvořit platbu' });
    }
});

// ─────────────────────────────────────────────
// POST /api/payments/notify
// GoPay webhook — nahrazuje Stripe /webhook
// ─────────────────────────────────────────────
router.post('/notify', async (req: Request, res: Response) => {
    const paymentId = (req.query.id ?? req.body?.id) as string;

    if (!paymentId) {
        res.status(400).send('Missing payment id');
        return;
    }

    try {
        const payment = await getPaymentStatus(paymentId);
        console.log(`GoPay notify: paymentId=${paymentId} state=${payment.state}`);

        if (payment.state !== 'PAID') {
            res.status(200).send('OK');
            return;
        }

        // Načti objednávku z DB podle gopay_payment_id
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('gopay_payment_id', paymentId)
            .single();

        if (!order) {
            console.error('Objednávka nenalezena pro paymentId:', paymentId);
            res.status(200).send('OK');
            return;
        }

        const { image_id, filename, user_id, gopay_order_id } = order;

        // Smaž pending záznamy pro tuto fotku
        await supabase
            .from('orders')
            .delete()
            .eq('image_id', image_id)
            .eq('stripe_payment_status', 'pending');

        // Ulož zaplacený záznam — stejná struktura jako Stripe verze
        const { error } = await supabase.from('orders').upsert({
            gopay_payment_id: paymentId,
            gopay_order_id,
            image_id,
            filename,
            stripe_payment_status: 'paid',
            amount_czk: Math.round(payment.amount / 100),
            user_id: user_id || null,
        });

        console.log('Supabase upsert error:', error);

        // Email notifikace — stejná šablona jako Stripe verze
        const customerEmail = order.email;
        if (customerEmail) {
            try {
                await resend.emails.send({
                    from: process.env.FROM_EMAIL ?? 'noreply@quickhdr.cz',
                    to: customerEmail,
                    subject: 'Vaše fotografie je připravena ke stažení',
                    html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
              
              <p style="font-size:14px;font-weight:600;color:#ffffff;margin:0 0 40px;">
                QuickHDR
                <span style="font-weight:300;color:#666;margin-left:6px;">AI Retušování</span>
              </p>

              <div style="width:48px;height:48px;border-radius:50%;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
                <span style="font-size:20px;">✓</span>
              </div>

              <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
                Vaše fotografie je připravena
              </h1>
              <p style="font-size:15px;color:#888;margin:0 0 32px;line-height:1.6;">
                Platba proběhla úspěšně a vaše fotografie 
                <strong style="color:#ccc;">${filename || 'bez názvu'}</strong> 
                je připravena ke stažení v plném rozlišení.
              </p>

              <a href="${FRONTEND_URL}/dashboard" 
                 style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
                Přejít do Moje fotografie →
              </a>

              <div style="border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:32px;">
                <p style="font-size:13px;color:#666;margin:0 0 8px;">
                  <strong style="color:#888;">Soubor:</strong> ${filename || image_id}
                </p>
                <p style="font-size:13px;color:#666;margin:0 0 8px;">
                  <strong style="color:#888;">Dostupné po dobu:</strong> 30 dní
                </p>
                <p style="font-size:13px;color:#666;margin:0;">
                  <strong style="color:#888;">Podpora:</strong> podpora@quickhdr.cz
                </p>
              </div>

              <p style="font-size:12px;color:#444;margin:0;line-height:1.6;">
                © ${new Date().getFullYear()} QuickHDR. Všechna práva vyhrazena.
              </p>
            </div>
          </body>
          </html>
        `,
                });
                console.log('Email notifikace odeslána na:', customerEmail);
            } catch (emailError) {
                console.error('Chyba při odesílání emailu:', emailError);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('GoPay notify error:', error);
        res.status(500).send('Error');
    }
});

// ─────────────────────────────────────────────
// GET /api/payments/verify/:paymentId
// Nahrazuje Stripe /verify/:sessionId
// Frontend volá po návratu z GoPay brány
// ─────────────────────────────────────────────
router.get('/verify/:paymentId', async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;

        // Nejdřív zkontroluj databázi
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('gopay_payment_id', paymentId)
            .single();

        if (order?.stripe_payment_status === 'paid') {
            res.json({ image_id: order.image_id, paid: true });
            return;
        }

        // Fallback — ověř přímo u GoPay
        const payment = await getPaymentStatus(paymentId);

        if (payment.state !== 'PAID') {
            res.status(402).json({ error: 'Platba nebyla dokončena' });
            return;
        }

        const { data: orderByGopay } = await supabase
            .from('orders')
            .select('image_id')
            .eq('gopay_payment_id', paymentId)
            .single();

        res.json({ image_id: orderByGopay?.image_id, paid: true });
    } catch (error) {
        console.error('Chyba při ověření platby:', error);
        res.status(500).json({ error: 'Nepodařilo se ověřit platbu' });
    }
});

export default router;