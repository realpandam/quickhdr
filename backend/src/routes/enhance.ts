import axios from 'axios';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { Resend } from 'resend';
import { sendExpiryReminders } from '../jobs/expiry-reminder';
import { supabase } from '../lib/supabase';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const API_KEY = process.env.AUTOENHANCE_API_KEY!;
const API_BASE = 'https://api.autoenhance.ai';
const GOPAY_RETURN_URL = process.env.GOPAY_RETURN_URL || 'https://fasthdr.cz';
const PRICE_CZK = parseInt(process.env.PRICE_CZK || '25');
const resend = new Resend(process.env.RESEND_API_KEY!);

function getMimeType(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
    '.tiff': 'image/tiff', '.tif': 'image/tiff', '.heif': 'image/heif',
    '.heic': 'image/heic', '.avif': 'image/avif',
    '.arw': 'image/x-sony-arw', '.sr2': 'image/x-sony-arw', '.srf': 'image/x-sony-arw',
    '.cr2': 'image/x-canon-cr2', '.cr3': 'image/x-canon-cr3', '.crw': 'image/x-canon-crw',
    '.nef': 'image/x-nikon-nef', '.nrw': 'image/x-nikon-nef',
    '.raf': 'image/x-fuji-raf', '.orf': 'image/x-olympus-orf',
    '.rw2': 'image/x-panasonic-rw2', '.pef': 'image/x-pentax-pef',
    '.kdc': 'image/x-kodak-kdc', '.erf': 'image/x-epson-erf',
    '.dng': 'image/x-adobe-dng', '.iiq': 'image/x-phase-one-iiq',
    '.mos': 'image/x-leaf-mos', '.mef': 'image/x-mamiya-mef',
    '.fff': 'image/x-hasselblad-fff', '.3fr': 'image/x-hasselblad-3fr',
    '.x3f': 'image/x-sigma-x3f', '.rwl': 'image/x-leica-rwl',
    '.srw': 'image/x-samsung-srw',
  };
  return mimeMap[ext] ?? fallback;
}

router.post('/upload', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];
  if (!file) { res.status(400).json({ error: 'Žádný soubor nebyl nahrán' }); return; }
  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const rawSettings = req.body.settings ? JSON.parse(req.body.settings) : {};
    const user_id = req.body.user_id || null;
    const session_id = req.body.session_id || null;
    const upload_batch_id = req.body.upload_batch_id || null;

    const createResponse = await axios.post(
      `${API_BASE}/v3/images/`,
      {
        image_name: file.originalname, image_type: ext, ai_version: '5.x', enhance: true,
        enhance_type: rawSettings.enhance_type ?? 'neutral',
        sky_replacement: rawSettings.sky_replacement ?? true,
        cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
        vertical_correction: rawSettings.vertical_correction ?? true,
        lens_correction: rawSettings.lens_correction ?? true,
        window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
        upscale: rawSettings.upscale ?? false, privacy: rawSettings.privacy ?? false,
      },
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );

    const { image_id, s3PutObjectUrl: upload_url } = createResponse.data;
    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;
    await axios.put(upload_url, file.buffer, { headers: { 'Content-Type': contentTypeFromUrl } });

    await supabase.from('orders').insert({
      image_id, filename: file.originalname, payment_status: 'pending',
      amount_czk: PRICE_CZK, user_id: user_id || null, session_id: session_id || null,
      payment_session_id: `pending_${image_id}`, upload_batch_id: upload_batch_id || null,
    }).select();

    res.json({ image_id });
  } catch (error) {
    console.error('Chyba při uploadu:', error);
    res.status(500).json({ error: 'Chyba při zpracování souboru' });
  }
});

router.get('/status/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const response = await axios.get(`${API_BASE}/v3/images/${imageId}`, { headers: { 'x-api-key': API_KEY } });
    res.json({ status: response.data.status });
  } catch (error) {
    console.error('Chyba při kontrole stavu:', error);
    res.status(500).json({ error: 'Nepodařilo se zjistit stav' });
  }
});

router.get('/enhanced/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const preview = req.query.preview !== 'false';
    const response = await axios.get(`${API_BASE}/v3/images/${imageId}/enhanced`, {
      headers: { 'x-api-key': API_KEY }, responseType: 'arraybuffer',
      params: { preview: preview ? 'true' : 'false', quality: preview ? 60 : 90 },
    });

    if (preview) {
      const sharp = require('sharp');
      const imageBuffer = Buffer.from(response.data);
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width ?? 800;
      const height = metadata.height ?? 600;
      const logoDarkPath = path.join(__dirname, '../../public/logo-dark.png');
      const logoLightPath = path.join(__dirname, '../../public/logo-light.png');
      let logoDarkBase64 = '';
      let logoLightBase64 = '';
      try {
        if (fs.existsSync(logoDarkPath)) logoDarkBase64 = fs.readFileSync(logoDarkPath).toString('base64');
        if (fs.existsSync(logoLightPath)) logoLightBase64 = fs.readFileSync(logoLightPath).toString('base64');
      } catch (err) { console.warn('Loga nenalezena:', err); }

      const svgWatermark = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="wm-dark" x="0" y="0" width="300" height="300" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              ${logoDarkBase64 ? `<image href="data:image/png;base64,${logoDarkBase64}" x="0" y="0" width="200" height="200" opacity="0.3"/>` : `<text x="0" y="100" font-family="Arial" font-size="24px" fill="rgba(255,255,255,0.35)">fasthdr.cz</text>`}
            </pattern>
            <pattern id="wm-light" x="0" y="0" width="300" height="300" patternUnits="userSpaceOnUse" patternTransform="rotate(-35) translate(150, 150)">
              ${logoLightBase64 ? `<image href="data:image/png;base64,${logoLightBase64}" x="0" y="0" width="200" height="200" opacity="0.3"/>` : `<text x="0" y="100" font-family="Arial" font-size="24px" fill="rgba(255,255,255,0.35)">fasthdr.cz</text>`}
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm-dark)"/>
          <rect width="100%" height="100%" fill="url(#wm-light)"/>
        </svg>
      `);

      const watermarked = await sharp(imageBuffer)
        .composite([{ input: svgWatermark, top: 0, left: 0 }])
        .jpeg({ quality: 60 }).toBuffer();
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(watermarked);
    } else {
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', `attachment; filename="enhanced_${imageId}.jpg"`);
      res.send(Buffer.from(response.data));
    }
  } catch (error) {
    console.error('Chyba při stahování výsledku:', error);
    res.status(500).json({ error: 'Nepodařilo se stáhnout výsledek' });
  }
});

router.post('/hdr/order', async (req: Request, res: Response) => {
  try {
    const user_id = req.body.user_id || null;
    const session_id = req.body.session_id || null;
    const filename = req.body.filename || null;
    const response = await axios.post(`${API_BASE}/v3/orders/`, {},
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
    const { order_id } = response.data;
    await supabase.from('orders').insert({
      image_id: `hdr_pending_${order_id}`, filename: filename || null,
      payment_status: 'pending', amount_czk: PRICE_CZK,
      user_id: user_id || null, session_id: session_id || null,
      hdr_order_id: order_id, payment_session_id: `pending_hdr_${order_id}`,
    });
    res.json({ order_id });
  } catch (error) {
    console.error('Chyba při vytváření orderu:', error);
    res.status(500).json({ error: 'Nepodařilo se vytvořit order' });
  }
});

router.post('/upload-bracket', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];
  if (!file) { res.status(400).json({ error: 'Žádný soubor nebyl nahrán' }); return; }
  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const order_id = req.body.order_id;
    if (!order_id) { res.status(400).json({ error: 'Chybí order_id' }); return; }
    const createResponse = await axios.post(`${API_BASE}/v3/brackets/`,
      { order_id, name: file.originalname },
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
    const upload_url = createResponse.data.upload_url ?? createResponse.data.s3PutObjectUrl;
    const bracket_id = createResponse.data.bracket_id ?? createResponse.data.image_id;
    if (!upload_url) throw new Error('Nepodařilo se získat upload URL');
    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;
    await axios.put(upload_url, file.buffer, {
      headers: { 'Content-Type': contentTypeFromUrl },
      maxBodyLength: Infinity, maxContentLength: Infinity,
    });
    res.json({ bracket_id });
  } catch (error) {
    console.error('Chyba při uploadu bracketu:', error);
    res.status(500).json({ error: 'Chyba při uploadu bracketu' });
  }
});

router.post('/hdr/order/:orderId/merge', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { number_of_brackets, settings } = req.body;
    const rawSettings = settings ?? {};
    const body: Record<string, unknown> = {
      hdr: true, ai_version: '5.x', enhance: true,
      enhance_type: rawSettings.enhance_type ?? 'neutral',
      sky_replacement: rawSettings.sky_replacement ?? true,
      cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
      vertical_correction: rawSettings.vertical_correction ?? true,
      lens_correction: rawSettings.lens_correction ?? true,
      window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
      upscale: rawSettings.upscale ?? false, privacy: rawSettings.privacy ?? false,
    };
    if (number_of_brackets && number_of_brackets > 1) body.number_of_brackets_per_image = number_of_brackets;
    await axios.post(`${API_BASE}/v3/orders/${orderId}/process`, body,
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při process:', error);
    res.status(500).json({ error: 'Nepodařilo se spustit HDR process' });
  }
});

router.get('/hdr/order/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const response = await axios.get(`${API_BASE}/v3/orders/${orderId}`, { headers: { 'x-api-key': API_KEY } });
    const { status, images, is_merging, is_processing } = response.data;
    const processedImages = (images ?? []).filter((img: { status: string }) => img.status === 'processed');
    res.json({ status, is_merging, is_processing, image_ids: processedImages.map((img: { image_id: string }) => img.image_id) });
  } catch (error) {
    console.error('Chyba při získávání stavu orderu:', error);
    res.status(500).json({ error: 'Nepodařilo se zjistit stav orderu' });
  }
});

router.post('/consent', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Chybí autorizační token' }); return; }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) { res.status(401).json({ error: 'Neplatný token' }); return; }
    const { error } = await supabase.from('user_consents').upsert({
      user_id: user.id,
      agreed_to_terms_at: new Date().toISOString(),
      agreed_to_privacy_at: new Date().toISOString(),
      ip_address: req.headers['x-forwarded-for']?.toString() ?? req.socket.remoteAddress,
      user_agent: req.headers['user-agent'],
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při ukládání souhlasu:', error);
    res.status(500).json({ error: 'Nepodařilo se uložit souhlas' });
  }
});

router.post('/webhook/autoenhance', async (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
  try {
    const { event, image_id, error, order_id, order_is_processing } = req.body;
    if (event !== 'image_processed' || error) return;

    let order = null;
    const { data: directOrder } = await supabase.from('orders').select('*').eq('image_id', image_id).single();
    if (directOrder) order = directOrder;

    if (!order && order_id && !order_is_processing) {
      const { data: hdrOrder } = await supabase.from('orders').select('*').eq('hdr_order_id', order_id).single();
      if (hdrOrder) {
        await supabase.from('orders').update({ image_id }).eq('hdr_order_id', order_id);
        order = { ...hdrOrder, image_id };
      }
    }

    if (!order) return;

    if (order.upload_batch_id) {
      const { data: batchOrders } = await supabase.from('orders').select('image_id').eq('upload_batch_id', order.upload_batch_id);
      if (batchOrders && batchOrders.length > 1) {
        const statuses = await Promise.allSettled(
          batchOrders.map(async (o) => {
            const r = await axios.get(`${API_BASE}/v3/images/${o.image_id}`, { headers: { 'x-api-key': API_KEY } });
            return r.data.status as string;
          })
        );
        const allDone = statuses.every((s) => s.status === 'fulfilled' && ['processed', 'failed', 'error'].includes(s.value));
        if (!allDone) return;

        if (order.user_id) {
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
            if (userData?.user?.email) {
              await resend.emails.send({
                from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
                to: userData.user.email,
                subject: `Vaše fotografie jsou zpracovány ✓ (${batchOrders.length} fotek)`,
                html: notifyBatchEmailHtml(batchOrders.length, GOPAY_RETURN_URL),
              });
            }
          } catch (emailErr) { console.error('Chyba při odesílání batch emailu:', emailErr); }
        }
        return;
      }
    }

    if (order.user_id) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
        if (userData?.user?.email) {
          await resend.emails.send({
            from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
            to: userData.user.email,
            subject: 'Vaše fotografie je zpracována ✓',
            html: notifyEmailHtml(order.filename, image_id, GOPAY_RETURN_URL),
          });
        }
      } catch (emailErr) { console.error('Chyba při odesílání emailu:', emailErr); }
    }
  } catch (err) { console.error('Webhook chyba:', err); }
});

router.post('/notify', async (req: Request, res: Response) => {
  try {
    const { user_id, filename, image_id, upload_batch_id } = req.body;
    if (!user_id || !image_id) { res.status(400).json({ error: 'Chybí user_id nebo image_id' }); return; }
    const { data: existing } = await supabase.from('orders').select('id').eq('image_id', image_id).single();
    if (!existing) {
      await supabase.from('orders').insert({
        image_id, filename: filename && !filename.includes(image_id) ? filename : null,
        payment_status: 'pending', amount_czk: PRICE_CZK, user_id,
        payment_session_id: `pending_${image_id}`, upload_batch_id: upload_batch_id || null,
      });
    }
    const { data: userData, error } = await supabase.auth.admin.getUserById(user_id);
    if (error || !userData?.user?.email) { res.status(404).json({ error: 'Uživatel nenalezen' }); return; }
    await resend.emails.send({
      from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
      to: userData.user.email,
      subject: 'Vaše fotografie je zpracována a připravena ke koupi',
      html: notifyEmailHtml(filename, image_id, GOPAY_RETURN_URL),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při odesílání notifikace:', error);
    res.status(500).json({ error: 'Nepodařilo se odeslat notifikaci' });
  }
});

function notifyBatchEmailHtml(count: number, frontendUrl: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
    <html lang="cs">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Zpracování dokončeno — FastHDR</title>
    </head>
    <body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;">
      <div style="display:none;max-height:0;overflow:hidden;">Všechny vaše fotografie (${count}) byly úspěšně zpracovány.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
              <tr>
                <td align="center" style="padding:0 0 32px;">
                  <img src="${frontendUrl}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;">
                </td>
              </tr>
              <tr>
                <td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background:#1E1535;border:1px solid #2E2350;border-radius:24px;padding:8px 16px;">
                        <span style="font-size:12px;font-weight:600;color:#A990F5;letter-spacing:0.5px;text-transform:uppercase;">● Zpracováno</span>
                      </td>
                    </tr>
                  </table>
                  <h1 style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">Vaše fotografie<br>jsou připraveny</h1>
                  <p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">Všech <strong style="color:#ffffff;font-weight:600;">${count} fotografií</strong> bylo úspěšně zpracováno pomocí AI modelu v5. Prohlédněte si náhledy a stáhněte výsledky v plném rozlišení.</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
                    <tr>
                      <td style="background:#7B5CF0;border-radius:10px;">
                        <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Zobrazit fotografie →</a>
                      </td>
                    </tr>
                  </table>
                  <div style="height:1px;background:#22222E;margin:0 0 24px;"></div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;width:120px;">Počet fotek</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${count}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Cena za fotku</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${PRICE_CZK} Kč</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Dostupnost</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">7 dní od vytvoření</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Podpora</td>
                      <td style="padding:8px 0;font-size:13px;"><a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;font-weight:500;">info@fasthdr.cz</a></td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px 0;">
                  <p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">Potřebujete pomoc? Napište nám na <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;">info@fasthdr.cz</a></p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px 32px 16px;border-top:1px solid #16161F;">
                  <p style="font-size:11px;line-height:1.7;color:#555568;margin:24px 0 0;text-align:center;">
                    <strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>
                    Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br>
                    <a href="${frontendUrl}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a> · <a href="${frontendUrl}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a> · <a href="${frontendUrl}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a>
                  </p>
                  <p style="font-size:11px;color:#444455;margin:16px 0 0;text-align:center;">© ${year} FASTHDR. Všechna práva vyhrazena.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

// ── Helper: email šablona ────────────────────────────────────────────────────
function notifyEmailHtml(filename: string, imageId: string, frontendUrl: string): string {
  const safeName = filename ?? 'bez názvu';
  const safeRef = filename ?? imageId;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
    <html lang="cs">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="color-scheme" content="dark">
      <meta name="supported-color-schemes" content="dark">
      <title>Zpracování dokončeno — FastHDR</title>
    </head>
    <body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;-webkit-font-smoothing:antialiased;">
      <!-- Hidden preheader -->
      <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#09090F;">
        Vaše fotografie ${safeName} byla úspěšně zpracována. Prohlédněte si náhled.
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

              <!-- Logo header -->
              <tr>
                <td align="center" style="padding:0 0 32px;">
                  <img src="${frontendUrl}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;outline:none;text-decoration:none;">
                </td>
              </tr>

              <!-- Hero card -->
              <tr>
                <td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;">

                  <!-- Status badge -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                    <tr>
                      <td style="background:#1E1535;border:1px solid #2E2350;border-radius:24px;padding:8px 16px;">
                        <span style="font-size:12px;font-weight:600;color:#A990F5;letter-spacing:0.5px;text-transform:uppercase;">
                          ● Zpracováno
                        </span>
                      </td>
                    </tr>
                  </table>

                  <!-- Heading -->
                  <h1 style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
                    Vaše fotografie<br>je připravena
                  </h1>

                  <!-- Description -->
                  <p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">
                    Soubor <strong style="color:#ffffff;font-weight:600;">${safeName}</strong> byl úspěšně zpracován pomocí AI modelu v5. Prohlédněte si náhled zdarma a stáhněte si výsledek v plném rozlišení.
                  </p>

                  <!-- CTA Button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
                    <tr>
                      <td style="background:#7B5CF0;border-radius:10px;">
                        <a href="${frontendUrl}/dashboard"
                          style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                          Zobrazit fotografii →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Divider -->
                  <div style="height:1px;background:#22222E;margin:0 0 24px;"></div>

                  <!-- Detail rows -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;width:120px;">Soubor</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;word-break:break-all;">${safeRef}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Cena</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${PRICE_CZK} Kč</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Dostupnost</td>
                      <td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">7 dní od vytvoření fotografie</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-size:13px;color:#8888A0;">Podpora</td>
                      <td style="padding:8px 0;font-size:13px;">
                        <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;font-weight:500;">info@fasthdr.cz</a>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

              <!-- Help row -->
              <tr>
                <td style="padding:24px 32px 0;">
                  <p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">
                    Potřebujete pomoc? Napište nám na
                    <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;">info@fasthdr.cz</a>
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:40px 32px 16px;border-top:1px solid #16161F;margin-top:32px;">
                  <p style="font-size:11px;line-height:1.7;color:#555568;margin:24px 0 0;text-align:center;">
                    <strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>
                    Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br>
                    <a href="${frontendUrl}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a>
                    ·
                    <a href="${frontendUrl}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a>
                    ·
                    <a href="${frontendUrl}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a>
                  </p>
                  <p style="font-size:11px;color:#444455;margin:16px 0 0;text-align:center;">
                    © ${year} FASTHDR. Všechna práva vyhrazena.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

export default router;