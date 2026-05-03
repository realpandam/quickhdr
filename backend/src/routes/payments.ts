import { Request, Response, Router } from 'express';
import { Resend } from 'resend';
import Stripe from 'stripe';
import { supabase } from '../lib/supabase';

console.log('Resend API key:', process.env.RESEND_API_KEY?.substring(0, 10) + '...');

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia' as any,
});

const PRICE_CZK = 5900;

const resend = new Resend(process.env.RESEND_API_KEY!);

router.post('/create-checkout', async (req: Request, res: Response) => {
    try {
        const { image_id, filename, user_id } = req.body;

        if (!image_id) {
            res.status(400).json({ error: 'Chybí image_id' });
            return;
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'czk',
                        product_data: {
                            name: `AI Retušování — ${filename ?? 'fotografie'}`,
                            description: 'Profesionální vylepšení fotografie pomocí AI',
                        },
                        unit_amount: PRICE_CZK,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/success?image_id=${image_id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/#editor`,
            metadata: {
                image_id,
                filename: filename ?? '',
                user_id: user_id ?? '',
            },
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('Chyba při vytváření checkout session:', error);
        res.status(500).json({ error: 'Nepodařilo se vytvořit platbu' });
    }
});

router.post('/webhook', async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
        res.status(400).json({ error: 'Chybí stripe-signature' });
        return;
    }

    let event: ReturnType<typeof stripe.webhooks.constructEvent>;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (error) {
        console.error('Webhook signature verification failed:', error);
        res.status(400).json({ error: 'Neplatný webhook' });
        return;
    }

    // V webhook handleru po úspěšné platbě:
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const image_id = session.metadata?.image_id;
        const user_id = session.metadata?.user_id;
        const filename = session.metadata?.filename;

        // Smaž pending záznam pro tuto fotku
        await supabase
            .from('orders')
            .delete()
            .eq('image_id', image_id)
            .eq('stripe_payment_status', 'pending');

        console.log('Webhook metadata:', { image_id, user_id, session_id: session.id });

        // Ulož zaplacený záznam
        const { error } = await supabase.from('orders').upsert({
            stripe_session_id: session.id,
            image_id,
            filename,
            stripe_payment_status: 'paid',
            amount_czk: Math.round((session.amount_total ?? 5900) / 100),
            user_id: user_id || null,
        });

        console.log('Supabase upsert error:', error);

        // Odešli email notifikaci
        const customerEmail = session.customer_details?.email;
        if (customerEmail) {
            try {
                await resend.emails.send({
                    from: process.env.FROM_EMAIL ?? 'noreply@filipzemek.cz',
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
              
              <!-- Logo -->
              <p style="font-size:14px;font-weight:600;color:#ffffff;margin:0 0 40px;">
                Filip Zemek
                <span style="font-weight:300;color:#666;margin-left:6px;">AI Retušování</span>
              </p>

              <!-- Ikona -->
              <div style="width:48px;height:48px;border-radius:50%;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:24px;">
                <span style="font-size:20px;">✓</span>
              </div>

              <!-- Nadpis -->
              <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
                Vaše fotografie je připravena
              </h1>
              <p style="font-size:15px;color:#888;margin:0 0 32px;line-height:1.6;">
                Platba proběhla úspěšně a vaše fotografie 
                <strong style="color:#ccc;">${filename || 'bez názvu'}</strong> 
                je připravena ke stažení v plném rozlišení.
              </p>

              <!-- Tlačítko -->
              <a href="${process.env.FRONTEND_URL}/dashboard" 
                 style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
                Přejít do Moje fotografie →
              </a>

              <!-- Info -->
              <div style="border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:32px;">
                <p style="font-size:13px;color:#666;margin:0 0 8px;">
                  <strong style="color:#888;">Soubor:</strong> ${filename || image_id}
                </p>
                <p style="font-size:13px;color:#666;margin:0 0 8px;">
                  <strong style="color:#888;">Dostupné po dobu:</strong> 30 dní
                </p>
                <p style="font-size:13px;color:#666;margin:0;">
                  <strong style="color:#888;">Podpora:</strong> fotograf@filipzemek.cz
                </p>
              </div>

              <!-- Footer -->
              <p style="font-size:12px;color:#444;margin:0;line-height:1.6;">
                © ${new Date().getFullYear()} Filip Zemek. Všechna práva vyhrazena.<br>
                IČO: 23584203 · Drnovec 1, 471 54 Cvikov
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
    }

    res.json({ received: true });
});

router.get('/verify/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;

        // Nejdřív zkontroluj databázi
        const { data: order } = await supabase
            .from('orders')
            .select('*')
            .eq('stripe_session_id', sessionId)
            .single();

        if (order?.stripe_payment_status === 'paid') {
            res.json({ image_id: order.image_id, paid: true });
            return;
        }

        // Fallback — ověř přímo u Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
            res.status(402).json({ error: 'Platba nebyla dokončena' });
            return;
        }

        const image_id = session.metadata?.image_id;
        res.json({ image_id, paid: true });
    } catch (error) {
        console.error('Chyba při ověření platby:', error);
        res.status(500).json({ error: 'Nepodařilo se ověřit platbu' });
    }
});

export default router;