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
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.fasthdr.cz';

const resend = new Resend(process.env.RESEND_API_KEY!);

function getMimeType(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.heif': 'image/heif',
    '.heic': 'image/heic',
    '.avif': 'image/avif',
    '.arw': 'image/x-sony-arw',
    '.sr2': 'image/x-sony-arw',
    '.srf': 'image/x-sony-arw',
    '.cr2': 'image/x-canon-cr2',
    '.cr3': 'image/x-canon-cr3',
    '.crw': 'image/x-canon-crw',
    '.nef': 'image/x-nikon-nef',
    '.nrw': 'image/x-nikon-nef',
    '.raf': 'image/x-fuji-raf',
    '.orf': 'image/x-olympus-orf',
    '.rw2': 'image/x-panasonic-rw2',
    '.pef': 'image/x-pentax-pef',
    '.kdc': 'image/x-kodak-kdc',
    '.erf': 'image/x-epson-erf',
    '.dng': 'image/x-adobe-dng',
    '.iiq': 'image/x-phase-one-iiq',
    '.mos': 'image/x-leaf-mos',
    '.mef': 'image/x-mamiya-mef',
    '.fff': 'image/x-hasselblad-fff',
    '.3fr': 'image/x-hasselblad-3fr',
    '.x3f': 'image/x-sigma-x3f',
    '.rwl': 'image/x-leica-rwl',
    '.srw': 'image/x-samsung-srw',
  };
  return mimeMap[ext] ?? fallback;
}

// ── Upload (non-HDR) ──────────────────────────────────────────────────────────
// Ukládá order do DB ihned po uploadu — pro přihlášené i nepřihlášené
router.post('/upload', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];

  if (!file) {
    res.status(400).json({ error: 'Žádný soubor nebyl nahrán' });
    return;
  }

  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const rawSettings = req.body.settings ? JSON.parse(req.body.settings) : {};

    // user_id a session_id přijdou z frontendu
    const user_id = req.body.user_id || null;
    const session_id = req.body.session_id || null;

    // Krok 1: Vytvoř image v Autoenhance
    const createResponse = await axios.post(
      `${API_BASE}/v3/images/`,
      {
        image_name: file.originalname,
        image_type: ext,
        ai_version: '5.x',
        enhance: true,
        enhance_type: rawSettings.enhance_type ?? 'neutral',
        sky_replacement: rawSettings.sky_replacement ?? true,
        cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
        vertical_correction: rawSettings.vertical_correction ?? true,
        lens_correction: rawSettings.lens_correction ?? true,
        window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
        upscale: rawSettings.upscale ?? false,
        privacy: rawSettings.privacy ?? false,
      },
      {
        headers: {
          'x-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const { image_id, s3PutObjectUrl: upload_url } = createResponse.data;

    // Krok 2: Nahraj soubor na S3
    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;

    await axios.put(upload_url, file.buffer, {
      headers: { 'Content-Type': contentTypeFromUrl },
    });

    // Krok 3: Ihned ulož order do DB (asynchronní zpracování — webhook dorazí později)
    await supabase.from('orders').insert({
      image_id,
      filename: file.originalname,
      payment_status: 'pending',
      amount_czk: 59,
      user_id: user_id || null,
      session_id: session_id || null,
      payment_session_id: `pending_${image_id}`,
    });

    res.json({ image_id });
  } catch (error) {
    console.error('Chyba při uploadu:', error);
    res.status(500).json({ error: 'Chyba při zpracování souboru' });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const response = await axios.get(`${API_BASE}/v3/images/${imageId}`, {
      headers: { 'x-api-key': API_KEY },
    });
    const { status } = response.data;
    res.json({ status });
  } catch (error) {
    console.error('Chyba při kontrole stavu:', error);
    res.status(500).json({ error: 'Nepodařilo se zjistit stav' });
  }
});

// ── Enhanced download ─────────────────────────────────────────────────────────
router.get('/enhanced/:imageId', async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    const preview = req.query.preview !== 'false';

    const response = await axios.get(
      `${API_BASE}/v3/images/${imageId}/enhanced`,
      {
        headers: { 'x-api-key': API_KEY },
        responseType: 'arraybuffer',
        params: {
          preview: preview ? 'true' : 'false',
          quality: preview ? 60 : 90,
        },
      }
    );

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
        if (fs.existsSync(logoDarkPath)) {
          logoDarkBase64 = fs.readFileSync(logoDarkPath).toString('base64');
        }
        if (fs.existsSync(logoLightPath)) {
          logoLightBase64 = fs.readFileSync(logoLightPath).toString('base64');
        }
      } catch (err) {
        console.warn('Loga nenalezena:', err);
      }

      const svgWatermark = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="wm-dark" x="0" y="0" width="300" height="300" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              ${logoDarkBase64
          ? `<image href="data:image/png;base64,${logoDarkBase64}" x="0" y="0" width="200" height="200" opacity="0.3"/>`
          : `<text x="0" y="100" font-family="Arial" font-size="24px" fill="rgba(255,255,255,0.35)">fasthdr.cz</text>`
        }
            </pattern>
            <pattern id="wm-light" x="0" y="0" width="300" height="300" patternUnits="userSpaceOnUse" patternTransform="rotate(-35) translate(150, 150)">
              ${logoLightBase64
          ? `<image href="data:image/png;base64,${logoLightBase64}" x="0" y="0" width="200" height="200" opacity="0.3"/>`
          : `<text x="0" y="100" font-family="Arial" font-size="24px" fill="rgba(255,255,255,0.35)">fasthdr.cz</text>`
        }
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm-dark)"/>
          <rect width="100%" height="100%" fill="url(#wm-light)"/>
        </svg>
      `);

      const watermarked = await sharp(imageBuffer)
        .composite([{ input: svgWatermark, top: 0, left: 0 }])
        .jpeg({ quality: 60 })
        .toBuffer();

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

// ── HDR: Vytvoř order ─────────────────────────────────────────────────────────
// Ukládá HDR order do DB ihned — pro přihlášené i nepřihlášené
router.post('/hdr/order', async (req: Request, res: Response) => {
  try {
    const user_id = req.body.user_id || null;
    const session_id = req.body.session_id || null;
    const filename = req.body.filename || null;

    const response = await axios.post(
      `${API_BASE}/v3/orders/`,
      {},
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );

    const { order_id } = response.data;

    // Ulož HDR order do DB ihned — image_id přijde z webhookem
    // Používáme hdr_group_id = order_id pro propojení
    await supabase.from('orders').insert({
      image_id: `hdr_pending_${order_id}`, // placeholder — přepíše webhook
      filename: filename || null,
      payment_status: 'pending',
      amount_czk: 59,
      user_id: user_id || null,
      session_id: session_id || null,
      hdr_order_id: order_id, // nový sloupec pro HDR
      payment_session_id: `pending_hdr_${order_id}`,
    });

    res.json({ order_id });
  } catch (error) {
    console.error('Chyba při vytváření orderu:', error);
    res.status(500).json({ error: 'Nepodařilo se vytvořit order' });
  }
});

// ── HDR: Nahraj bracket ───────────────────────────────────────────────────────
router.post('/upload-bracket', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];

  if (!file) {
    res.status(400).json({ error: 'Žádný soubor nebyl nahrán' });
    return;
  }

  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const order_id = req.body.order_id;

    if (!order_id) {
      res.status(400).json({ error: 'Chybí order_id' });
      return;
    }

    const createResponse = await axios.post(
      `${API_BASE}/v3/brackets/`,
      { order_id, name: file.originalname },
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );

    const upload_url = createResponse.data.upload_url ?? createResponse.data.s3PutObjectUrl;
    const bracket_id = createResponse.data.bracket_id ?? createResponse.data.image_id;

    if (!upload_url) throw new Error('Nepodařilo se získat upload URL');

    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;

    await axios.put(upload_url, file.buffer, {
      headers: { 'Content-Type': contentTypeFromUrl },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    res.json({ bracket_id });
  } catch (error) {
    console.error('Chyba při uploadu bracketu:', error);
    res.status(500).json({ error: 'Chyba při uploadu bracketu' });
  }
});

// ── HDR: Spusť process ────────────────────────────────────────────────────────
router.post('/hdr/order/:orderId/merge', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { number_of_brackets, settings } = req.body;
    const rawSettings = settings ?? {};

    const body: Record<string, unknown> = {
      hdr: true,
      ai_version: '5.x',
      enhance: true,
      enhance_type: rawSettings.enhance_type ?? 'neutral',
      sky_replacement: rawSettings.sky_replacement ?? true,
      cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
      vertical_correction: rawSettings.vertical_correction ?? true,
      lens_correction: rawSettings.lens_correction ?? true,
      window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
      upscale: rawSettings.upscale ?? false,
      privacy: rawSettings.privacy ?? false,
    };

    if (number_of_brackets && number_of_brackets > 1) {
      body.number_of_brackets_per_image = number_of_brackets;
    }

    await axios.post(
      `${API_BASE}/v3/orders/${orderId}/process`,
      body,
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při process:', error);
    res.status(500).json({ error: 'Nepodařilo se spustit HDR process' });
  }
});

// ── HDR: Stav orderu ──────────────────────────────────────────────────────────
router.get('/hdr/order/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const response = await axios.get(
      `${API_BASE}/v3/orders/${orderId}`,
      { headers: { 'x-api-key': API_KEY } }
    );

    const { status, images, is_merging, is_processing } = response.data;
    const processedImages = (images ?? []).filter(
      (img: { status: string }) => img.status === 'processed'
    );

    res.json({
      status,
      is_merging,
      is_processing,
      image_ids: processedImages.map((img: { image_id: string }) => img.image_id),
    });
  } catch (error) {
    console.error('Chyba při získávání stavu orderu:', error);
    res.status(500).json({ error: 'Nepodařilo se zjistit stav orderu' });
  }
});

// ── Souhlas ───────────────────────────────────────────────────────────────────
router.post('/consent', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Chybí autorizační token' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.status(401).json({ error: 'Neplatný token' });
      return;
    }

    const { error } = await supabase
      .from('user_consents')
      .upsert({
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

// ── Cron: expiry reminders ────────────────────────────────────────────────────
router.get('/cron/expiry-reminders', async (req: Request, res: Response) => {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    await sendExpiryReminders();
    res.json({ ok: true });
  } catch (err) {
    console.error('Chyba cron jobu:', err);
    res.status(500).json({ error: 'Cron job selhal' });
  }
});

// ── Autoenhance Webhook ───────────────────────────────────────────────────────
// Autoenhance volá tento endpoint po dokončení zpracování každé fotky
router.post('/webhook/autoenhance', async (req: Request, res: Response) => {
  // Odpověz okamžitě — Autoenhance čeká max 5s
  res.status(200).json({ ok: true });

  try {
    const { event, image_id, error, order_id, order_is_processing } = req.body;

    // Zpracuj pouze úspěšně dokončené fotky
    if (event !== 'image_processed' || error) return;

    // ── Non-HDR: najdi order podle image_id ──
    let order = null;
    const { data: directOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('image_id', image_id)
      .single();

    if (directOrder) {
      order = directOrder;
    }

    // ── HDR: najdi order podle hdr_order_id, ale jen pokud order už není processing ──
    if (!order && order_id && !order_is_processing) {
      const { data: hdrOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('hdr_order_id', order_id)
        .single();

      if (hdrOrder) {
        // Aktualizuj image_id placeholder na skutečný
        await supabase
          .from('orders')
          .update({ image_id })
          .eq('hdr_order_id', order_id);

        order = { ...hdrOrder, image_id };
      }
    }

    if (!order) return;

    // ── Přihlášený uživatel — pošli email ──
    if (order.user_id) {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
        if (userData?.user?.email) {
          await resend.emails.send({
            from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
            to: userData.user.email,
            subject: 'Vaše fotografie je zpracována ✓',
            html: notifyEmailHtml(order.filename, image_id, FRONTEND_URL),
          });
        }
      } catch (emailErr) {
        console.error('Chyba při odesílání emailu:', emailErr);
      }
    }

    // ── Nepřihlášený uživatel — nic neposíláme,
    //    uživatel sleduje stav na /result/[imageId] stránce ──

  } catch (err) {
    console.error('Webhook chyba:', err);
  }
});

// ── Notify: starý endpoint — zachován pro zpětnou kompatibilitu ───────────────
// Nové asynchronní zpracování používá webhook, ale polling v ImageUploader
// stále volá notify pro přihlášené uživatele jako fallback
router.post('/notify', async (req: Request, res: Response) => {
  try {
    const { user_id, filename, image_id } = req.body;

    if (!user_id || !image_id) {
      res.status(400).json({ error: 'Chybí user_id nebo image_id' });
      return;
    }

    // Zkontroluj jestli order již existuje (webhook ho mohl vytvořit dříve)
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('image_id', image_id)
      .single();

    if (!existing) {
      await supabase.from('orders').insert({
        image_id,
        filename: filename && !filename.includes(image_id) ? filename : null,
        payment_status: 'pending',
        amount_czk: 59,
        user_id,
        payment_session_id: `pending_${image_id}`,
      });
    }

    // Email notifikace
    const { data: userData, error } = await supabase.auth.admin.getUserById(user_id);
    if (error || !userData?.user?.email) {
      res.status(404).json({ error: 'Uživatel nenalezen' });
      return;
    }

    await resend.emails.send({
      from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
      to: userData.user.email,
      subject: 'Vaše fotografie je zpracována a připravena ke koupi',
      html: notifyEmailHtml(filename, image_id, FRONTEND_URL),
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při odesílání notifikace:', error);
    res.status(500).json({ error: 'Nepodařilo se odeslat notifikaci' });
  }
});

// ── Helper: email šablona ─────────────────────────────────────────────────────
function notifyEmailHtml(filename: string, imageId: string, frontendUrl: string): string {
  return `<!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
        <p style="font-size:14px;font-weight:600;color:#ffffff;margin:0 0 40px;">FASTHDR</p>
        <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
          Zpracování dokončeno ✓
        </h1>
        <p style="font-size:15px;color:#888;margin:0 0 32px;line-height:1.6;">
          Vaše fotografie <strong style="color:#ccc;">${filename ?? 'bez názvu'}</strong>
          byla úspěšně zpracována pomocí AI. Můžete si prohlédnout náhled a zakoupit plné rozlišení.
        </p>
        <a href="${frontendUrl}/dashboard"
           style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
          Zobrazit v Moje fotografie →
        </a>
        <div style="border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:32px;">
          <p style="font-size:13px;color:#666;margin:0 0 8px;">
            <strong style="color:#888;">Soubor:</strong> ${filename ?? imageId}
          </p>
          <p style="font-size:13px;color:#666;margin:0 0 8px;">
            <strong style="color:#888;">Cena:</strong> 59 Kč
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
    </html>`;
}

export default router;