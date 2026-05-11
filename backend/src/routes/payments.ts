import { Request, Response, Router } from 'express';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';
import { createPayment, getPaymentStatus } from '../services/gopay.service';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY!);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const GOPAY_RETURN_URL = process.env.GOPAY_RETURN_URL || 'https://fasthdr.cz';

const PRICE_CZK = parseInt(process.env.PRICE_CZK || '25');

// Mock flow — zapni přes GOPAY_MOCK=true v Railway nebo automaticky v development
const IS_MOCK = process.env.GOPAY_MOCK === 'true' || process.env.NODE_ENV !== 'production';

// ─────────────────────────────────────────────
// POST /api/payments/create-checkout
// ─────────────────────────────────────────────
router.post('/create-checkout', async (req: Request, res: Response) => {
    try {
        const { image_id, filename, user_id, email } = req.body;

        if (!image_id) {
            res.status(400).json({ error: 'Chybí image_id' });
            return;
        }

        const orderId = `ORDER-${image_id}-${Date.now()}`;

        if (IS_MOCK) {
            const mockPaymentId = `MOCK-${Date.now()}`;

            await supabase.from('orders')
                .update({
                    gopay_order_id: orderId,
                    gopay_payment_id: mockPaymentId,
                    email: email || null,
                })
                .eq('image_id', image_id)
                .eq('payment_status', 'pending');

            const mockUrl = `${FRONTEND_URL}/success?image_id=${image_id}&gopay_id=${mockPaymentId}&mock=true`;
            res.json({ url: mockUrl });

        } else {
            const payment = await createPayment({
                orderId,
                amount: PRICE_CZK,
                currency: 'CZK',
                email: email || 'noreply@fasthdr.cz',
                description: `FASTHDR — ${filename ?? 'fotografie'}`,
                returnUrl: `${GOPAY_RETURN_URL}/success?image_id=${image_id}`,
                notifyUrl: `${process.env.BACKEND_URL || 'https://api.fasthdr.cz'}/api/payments/notify`,
            });

            await supabase.from('orders')
                .update({
                    gopay_order_id: orderId,
                    gopay_payment_id: String(payment.id),
                    email: email || null,
                })
                .eq('image_id', image_id)
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
            // ── Mock ověření ─────────────────────────────
            const { data: order } = await supabase
                .from('orders')
                .select('*')
                .eq('gopay_payment_id', paymentId)
                .single();

            if (!order) {
                res.status(404).json({ error: 'Objednávka nenalezena' });
                return;
            }

            await supabase.from('orders')
                .update({ payment_status: 'paid' })
                .eq('gopay_payment_id', paymentId);

            if (order.email) {
                await sendConfirmationEmail(order.email, order.filename, order.image_id);
            }

            res.json({ image_id: order.image_id, paid: true });
            return;
        }

        // ── GoPay ověření ────────────────────────────────
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('gopay_payment_id', paymentId)
            .single();

        if (order?.payment_status === 'paid') {
            res.json({ image_id: order.image_id, paid: true });
            return;
        }

        const payment = await getPaymentStatus(paymentId);

        if (payment.state !== 'PAID') {
            res.status(402).json({ error: 'Platba nebyla dokončena' });
            return;
        }

        await supabase.from('orders')
            .update({ payment_status: 'paid' })
            .eq('gopay_payment_id', paymentId);

        const customerEmail = order?.email || payment.payer?.contact?.email;
        if (customerEmail) {
            await sendConfirmationEmail(customerEmail, order?.filename ?? '', order?.image_id ?? '');
        }

        res.json({ image_id: order?.image_id, paid: true });

    } catch (error) {
        res.status(500).json({ error: 'Nepodařilo se ověřit platbu' });
    }
});

// ─────────────────────────────────────────────
// POST /api/payments/notify
// GoPay webhook — volá GoPay při změně stavu platby
// ─────────────────────────────────────────────
router.post('/notify', async (req: Request, res: Response) => {
    try {
        const paymentId = req.query.id as string;

        if (!paymentId) {
            res.status(400).send('Missing payment id');
            return;
        }

        const payment = await getPaymentStatus(paymentId);

        if (payment.state === 'PAID') {
            const { data: order } = await supabase
                .from('orders')
                .select('*')
                .eq('gopay_payment_id', paymentId)
                .single();

            if (order) {
                await supabase.from('orders')
                    .update({ payment_status: 'paid' })
                    .eq('gopay_payment_id', paymentId);

                const customerEmail = order.email || payment.payer?.contact?.email;
                if (customerEmail) {
                    await sendConfirmationEmail(customerEmail, order.filename, order.image_id);
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        res.status(500).send('Error');
    }
});

// ─────────────────────────────────────────────
// Helper — email notifikace po platbě
// ─────────────────────────────────────────────
async function sendConfirmationEmail(email: string, filename: string, imageId: string) {
    try {
        await resend.emails.send({
            from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
            to: email,
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
                            FASTHDR
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
                                <strong style="color:#888;">Soubor:</strong> ${filename || imageId}
                            </p>
                            <p style="font-size:13px;color:#666;margin:0 0 8px;">
                                <strong style="color:#888;">Dostupné po dobu:</strong> 7 dní
                            </p>
                            <p style="font-size:13px;color:#666;margin:0;">
                                <strong style="color:#888;">Podpora:</strong> info@fasthdr.cz
                            </p>
                        </div>

                        <p style="font-size:12px;color:#444;margin:0;line-height:1.6;">
                            © ${new Date().getFullYear()} FASTHDR. Všechna práva vyhrazena.<br>
                            IČO: 23584203 · Drnovec 1, 471 54 Cvikov
                        </p>

                    </div>
                </body>
                </html>
            `,
        });
    } catch (err) {
        console.error('Chyba při odesílání emailu:', err);
    }
}

export default router;