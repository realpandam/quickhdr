import { Resend } from 'resend';
import { supabase } from '../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY!);
const GOPAY_RETURN_URL = process.env.GOPAY_RETURN_URL || 'https://www.fasthdr.cz';

export async function sendExpiryReminders() {
    const in2days = new Date();
    in2days.setDate(in2days.getDate() + 2);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('payment_status', 'paid')
        .not('email', 'is', null)
        .gte('expires_at', tomorrow.toISOString())
        .lte('expires_at', in2days.toISOString());

    if (!orders?.length) {
        console.log('Žádné blížící se expirace');
        return;
    }

    for (const order of orders) {
        try {
            await resend.emails.send({
                from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
                to: order.email,
                subject: '⏰ Vaše fotografie brzy vyprší — stáhněte ji včas',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                        <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
                            <p style="font-size:14px;font-weight:600;color:#ffffff;margin:0 0 40px;">FASTHDR</p>
                            <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
                                Fotografie brzy vyprší
                            </h1>
                            <p style="font-size:15px;color:#888;margin:0 0 32px;line-height:1.6;">
                                Vaše fotografie <strong style="color:#ccc;">${order.filename || 'bez názvu'}</strong>
                                bude dostupná ještě přibližně <strong style="color:#f59e0b;">24 hodin</strong>.
                                Stáhněte ji co nejdříve.
                            </p>
                            <a href="${GOPAY_RETURN_URL}/dashboard"
                               style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
                                Stáhnout fotografii →
                            </a>
                            <div style="border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:32px;">
                                <p style="font-size:13px;color:#666;margin:0 0 8px;">
                                    <strong style="color:#888;">Soubor:</strong> ${order.filename || order.image_id}
                                </p>
                                <p style="font-size:13px;color:#666;margin:0;">
                                    <strong style="color:#888;">Vyprší:</strong> ${new Date(order.expires_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                            <p style="font-size:12px;color:#444;margin:0;line-height:1.6;">
                                © ${new Date().getFullYear()} FASTHDR. Všechna práva vyhrazena.<br>
                                IČO: 23584203 · info@fasthdr.cz
                            </p>
                        </div>
                    </body>
                    </html>
                `,
            });
            console.log(`Reminder odeslán: ${order.email} (${order.filename})`);
        } catch (err) {
            console.error(`Chyba při odesílání reminder pro ${order.email}:`, err);
        }
    }

    console.log(`Celkem odesláno ${orders.length} reminder emailů`);
}