import axios from 'axios';
import { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import { Resend } from 'resend';
import { supabase } from '../lib/supabase';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const API_KEY = process.env.AUTOENHANCE_API_KEY!;
const API_BASE = 'https://api.autoenhance.ai';

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

// Krok 1 + 2: Vytvoř image a nahraj soubor
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

    // Krok 1: Vytvoř image metadata
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

    // Extrahuj Content-Type z presigned URL, fallback na náš mimeMap
    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;

    // Krok 2: Nahraj binární soubor na presigned URL
    await axios.put(upload_url, file.buffer, {
      headers: {
        'Content-Type': contentTypeFromUrl,
      },
    });

    res.json({ image_id });
  } catch (error) {
    console.error('Chyba při uploadu:', error);
    res.status(500).json({ error: 'Chyba při zpracování souboru' });
  }
});

// Krok 3: Polling — zjisti stav zpracování
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

// Krok 4: Stáhni výsledek
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
      // Přidej vodoznak pomocí Sharp
      const sharp = require('sharp');

      const imageBuffer = Buffer.from(response.data);
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width ?? 800;
      const height = metadata.height ?? 600;

      // Vytvoř SVG vodoznak
      const watermarkText = 'filipzemek.cz — náhled';
      const fontSize = Math.max(16, Math.round(width / 30));
      const padding = 20;

      const svgWatermark = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <!-- Diagonální vodoznak opakující se přes celý obrázek -->
          <defs>
            <pattern id="wm" x="0" y="0" width="300" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
              <text x="0" y="100" 
                font-family="Arial, sans-serif" 
                font-size="${fontSize}px" 
                fill="rgba(255,255,255,0.35)" 
                font-weight="600"
                letter-spacing="2">
                ${watermarkText}
              </text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm)"/>
          <!-- Spodní pruh s logem -->
          <rect x="0" y="${height - 48}" width="${width}" height="48" fill="rgba(0,0,0,0.55)"/>
          <text x="${padding}" y="${height - 16}" 
            font-family="Arial, sans-serif" 
            font-size="14px" 
            fill="rgba(255,255,255,0.9)"
            font-weight="600">
            Filip Zemek · AI Retušování
          </text>
          <text x="${width - padding}" y="${height - 16}" 
            font-family="Arial, sans-serif" 
            font-size="13px" 
            fill="rgba(245,158,11,0.9)"
            font-weight="600"
            text-anchor="end">
            Koupit plnou verzi →
          </text>
        </svg>
      `);

      const watermarked = await sharp(imageBuffer)
        .composite([{
          input: svgWatermark,
          top: 0,
          left: 0,
        }])
        .jpeg({ quality: 60 })
        .toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(watermarked);
    } else {
      // Plná verze bez vodoznaku
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Disposition', `attachment; filename="enhanced_${imageId}.jpg"`);
      res.send(Buffer.from(response.data));
    }
  } catch (error) {
    console.error('Chyba při stahování výsledku:', error);
    res.status(500).json({ error: 'Nepodařilo se stáhnout výsledek' });
  }
});

// HDR: Vytvoř order
router.post('/hdr/order', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${API_BASE}/v3/orders/`,
      {},
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );
    res.json({ order_id: response.data.order_id });
  } catch (error) {
    console.error('Chyba při vytváření orderu:', error);
    res.status(500).json({ error: 'Nepodařilo se vytvořit order' });
  }
});

// HDR: Nahraj bracket do existujícího orderu — správný endpoint /v3/brackets/
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

    // Správný endpoint pro HDR brackety je /v3/brackets/ ne /v3/images/
    const createResponse = await axios.post(
      `${API_BASE}/v3/brackets/`,
      {
        order_id,
        name: file.originalname,
      },
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
    );

    // Nový API vrací upload_url, starý s3PutObjectUrl
    const upload_url = createResponse.data.upload_url ?? createResponse.data.s3PutObjectUrl;
    const bracket_id = createResponse.data.bracket_id ?? createResponse.data.image_id;

    if (!upload_url) {
      throw new Error('Nepodařilo se získat upload URL');
    }

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

// HDR: Spusť process orderu
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

    // Správný endpoint je /process ne /merge
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

// HDR: Stav orderu + image_ids výsledků
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

// V notify endpointu — přidej uložení do Supabase
router.post('/notify', async (req: Request, res: Response) => {
  try {
    const { user_id, filename, image_id } = req.body;

    if (!user_id || !image_id) {
      res.status(400).json({ error: 'Chybí user_id nebo image_id' });
      return;
    }

    // Ulož zpracovanou fotku do databáze jako pending
    await supabase.from('orders').upsert({
      image_id,
      filename: filename && !filename.includes(image_id) ? filename : null,
      payment_status: 'pending',
      amount_czk: 59,
      user_id,
      payment_session_id: `pending_${image_id}`, // dočasný unikátní klíč
    });

    // Získej email a pošli notifikaci
    const { data: userData, error } = await supabase.auth.admin.getUserById(user_id);
    if (error || !userData?.user?.email) {
      res.status(404).json({ error: 'Uživatel nenalezen' });
      return;
    }

    const userEmail = userData.user.email;

    await resend.emails.send({
      from: process.env.FROM_EMAIL ?? 'onboarding@resend.dev',
      to: userEmail,
      subject: 'Vaše fotografie je zpracována a připravena ke koupi',
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
              Filip Zemek
              <span style="font-weight:300;color:#666;margin-left:6px;">AI Retušování</span>
            </p>

            <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">
              Zpracování dokončeno ✓
            </h1>
            <p style="font-size:15px;color:#888;margin:0 0 32px;line-height:1.6;">
              Vaše fotografie <strong style="color:#ccc;">${filename ?? 'bez názvu'}</strong> 
              byla úspěšně zpracována pomocí AI. Můžete si prohlédnout náhled a zakoupit plné rozlišení.
            </p>

            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px;">
              Zobrazit v Moje fotografie →
            </a>

            <div style="border:1px solid #222;border-radius:8px;padding:20px;margin-bottom:32px;">
              <p style="font-size:13px;color:#666;margin:0 0 8px;">
                <strong style="color:#888;">Soubor:</strong> ${filename ?? image_id}
              </p>
              <p style="font-size:13px;color:#666;margin:0 0 8px;">
                <strong style="color:#888;">Cena:</strong> 59 Kč
              </p>
              <p style="font-size:13px;color:#666;margin:0;">
                <strong style="color:#888;">Podpora:</strong> fotograf@filipzemek.cz
              </p>
            </div>

            <p style="font-size:12px;color:#444;margin:0;line-height:1.6;">
              © ${new Date().getFullYear()} Filip Zemek. Všechna práva vyhrazena.<br>
              IČO: 23584203 · Drnovec 1, 471 54 Cvikov
            </p>
          </div>
        </body>
        </html>
      `,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Chyba při odesílání notifikace:', error);
    res.status(500).json({ error: 'Nepodařilo se odeslat notifikaci' });
  }
});

export default router;