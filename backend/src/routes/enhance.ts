import axios from 'axios';
import { randomUUID } from 'crypto';
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

// ── Dropbox OAuth ─────────────────────────────────────────────────────────────
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY!;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET!;
const DROPBOX_REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || 'https://fasthdr.cz/dropbox-callback.html';

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'gif',
  'arw', 'sr2', 'srf', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'raf', 'orf', 'rw2', 'pef',
  'kdc', 'erf', 'dng', 'iiq', 'mos', 'mef', 'fff', '3fr', 'x3f', 'rwl', 'srw',
]);

const BLOCKED_MIME_PREFIXES = ['text/', 'video/', 'audio/'];
const BLOCKED_MIME_EXACT = [
  'application/pdf', 'application/zip', 'application/x-rar-compressed',
  'application/x-rar', 'application/x-msdownload', 'application/x-executable',
  'application/x-sh', 'application/x-bat',
];

function isFileAllowed(file: Express.Multer.File): { ok: boolean; reason?: string } {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  const mime = file.mimetype.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `Nepodporovaný formát souboru (.${ext || 'neznámý'}). Povoleny jsou JPG, PNG, TIFF, WEBP, HEIC a RAW formáty (ARW, CR2, NEF, DNG…).` };
  }
  for (const blocked of BLOCKED_MIME_PREFIXES) {
    if (mime.startsWith(blocked)) return { ok: false, reason: 'Nahraný soubor není platný obrázek.' };
  }
  if (BLOCKED_MIME_EXACT.includes(mime)) return { ok: false, reason: 'Nahraný soubor není platný obrázek.' };
  return { ok: true };
}

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

async function pLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ── Dropbox: zjisti namespace pro Team účty ───────────────────────────────────
// Team Dropbox účty potřebují Dropbox-API-Path-Root header s namespace_id.
// Tato funkce zjistí namespace z /users/get_current_account a vrátí ho.
// Pro osobní účty vrátí null.
async function getDropboxNamespaceId(access_token: string): Promise<string | null> {
  try {
    const res = await axios.post(
      'https://api.dropbox.com/2/users/get_current_account',
      null,
      { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
    );
    const namespaceId = res.data?.root_info?.root_namespace_id ?? null;
    return namespaceId ? String(namespaceId) : null;
  } catch (err: any) {
    console.error(`[dropbox-namespace] Nepodařilo se zjistit namespace: ${err?.message}`);
    return null;
  }
}

// ── Dropbox OAuth: vrať authorization URL ────────────────────────────────────
router.get('/dropbox-auth-url', (req: Request, res: Response) => {
  if (!DROPBOX_APP_KEY) {
    res.status(500).json({ error: 'Dropbox OAuth není nakonfigurován' });
    return;
  }
  const state = randomUUID();
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    redirect_uri: DROPBOX_REDIRECT_URI,
    response_type: 'code',
    token_access_type: 'online',
    state,
  });
  res.json({
    url: `https://www.dropbox.com/oauth2/authorize?${params.toString()}`,
    state,
  });
});

// ── Dropbox OAuth: vyměň code za access token ─────────────────────────────────
router.post('/dropbox-token', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'Chybí code' }); return; }
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    res.status(500).json({ error: 'Dropbox OAuth není nakonfigurován' }); return;
  }
  try {
    const credentials = Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString('base64');
    const tokenRes = await axios.post(
      'https://api.dropbox.com/oauth2/token',
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: DROPBOX_REDIRECT_URI,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    res.json({
      access_token: tokenRes.data.access_token,
      account_id: tokenRes.data.account_id,
    });
  } catch (err: any) {
    console.error('[dropbox-token] Chyba:', err?.response?.data ?? err);
    res.status(500).json({ error: 'Nepodařilo se získat Dropbox access token' });
  }
});

// ── Dropbox OAuth: seznam souborů/složek ──────────────────────────────────────
router.post('/dropbox-list', async (req: Request, res: Response) => {
  const { access_token, path: folderPath = '' } = req.body;
  if (!access_token) { res.status(400).json({ error: 'Chybí access_token' }); return; }
  try {
    const listRes = await axios.post(
      'https://api.dropbox.com/2/files/list_folder',
      {
        path: folderPath,
        recursive: false,
        include_media_info: true,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      },
      { headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
    );
    // ← ZMĚNA 1: přidáno sharing_info — frontend ho potřebuje pro sdílené složky
    const entries = (listRes.data.entries ?? []).map((entry: any) => ({
      tag: entry['.tag'],
      id: entry.id,
      name: entry.name,
      path_lower: entry.path_lower,
      size: entry.size,
      modified: entry.server_modified,
      sharing_info: entry.sharing_info ?? null,
    }));
    res.json({ entries, has_more: listRes.data.has_more, cursor: listRes.data.cursor });
  } catch (err: any) {
    console.error('[dropbox-list] Chyba:', err?.response?.data ?? err);
    res.status(500).json({ error: 'Nepodařilo se načíst obsah složky' });
  }
});

// ── Batch status ──────────────────────────────────────────────────────────────
router.get('/batch-status/:batchId', async (req: Request, res: Response) => {
  const { batchId } = req.params;
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('image_id, filename')
      .eq('upload_batch_id', batchId);
    if (error) throw error;
    if (!orders || orders.length === 0) {
      res.json({ phase: 'uploading', total: 0, uploaded: 0, processed: 0, failed: 0, image_ids: [] });
      return;
    }
    const statuses = await Promise.allSettled(
      orders.map(async (o) => {
        try {
          const r = await axios.get(`${API_BASE}/v3/images/${o.image_id}`, { headers: { 'x-api-key': API_KEY } });
          return { image_id: o.image_id, status: r.data.status as string };
        } catch {
          return { image_id: o.image_id, status: 'uploading' };
        }
      })
    );
    const results = statuses.map((s, i) =>
      s.status === 'fulfilled' ? s.value : { image_id: orders[i].image_id, status: 'error' }
    );
    const processed = results.filter(r => r.status === 'processed');
    const failed = results.filter(r => ['failed', 'error'].includes(r.status));
    const uploading = results.filter(r => r.status === 'uploading');
    const total = results.length;
    const done = processed.length + failed.length;
    let phase: 'uploading' | 'processing' | 'done';
    if (uploading.length === total) phase = 'uploading';
    else if (done === total) phase = 'done';
    else phase = 'processing';
    res.json({ phase, total, uploaded: total - uploading.length, processed: processed.length, failed: failed.length, image_ids: processed.map(r => r.image_id) });
  } catch (err) {
    console.error('[batch-status] Chyba:', err);
    res.status(500).json({ error: 'Nepodařilo se zjistit stav batche' });
  }
});

// ── Upload (non-HDR) ──────────────────────────────────────────────────────────
router.post('/upload', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];
  if (!file) { res.status(400).json({ error: 'Žádný soubor nebyl nahrán' }); return; }
  const validation = isFileAllowed(file);
  if (!validation.ok) { res.status(415).json({ error: validation.reason }); return; }
  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const rawSettings = req.body.settings ? JSON.parse(req.body.settings) : {};
    const user_id = req.body.user_id || null;
    const session_id = req.body.session_id || null;
    const upload_batch_id = req.body.upload_batch_id || null;
    const createResponse = await axios.post(`${API_BASE}/v3/images/`, {
      image_name: file.originalname, image_type: ext, ai_version: '5.x', enhance: true,
      enhance_type: rawSettings.enhance_type ?? 'neutral',
      sky_replacement: rawSettings.sky_replacement ?? true,
      cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
      vertical_correction: rawSettings.vertical_correction ?? true,
      lens_correction: rawSettings.lens_correction ?? true,
      window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
      upscale: rawSettings.upscale ?? false, privacy: rawSettings.privacy ?? false,
    }, { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
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

// ── Status ────────────────────────────────────────────────────────────────────
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

// ── Enhanced download ─────────────────────────────────────────────────────────
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

// ── HDR: Vytvoř order ─────────────────────────────────────────────────────────
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

// ── HDR: Nahraj bracket ───────────────────────────────────────────────────────
router.post('/upload-bracket', upload.fields([{ name: 'image', maxCount: 1 }]), async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const file = files['image']?.[0];
  if (!file) { res.status(400).json({ error: 'Žádný soubor nebyl nahrán' }); return; }
  const validation = isFileAllowed(file);
  if (!validation.ok) { res.status(415).json({ error: validation.reason }); return; }
  try {
    const correctMime = getMimeType(file.originalname, file.mimetype);
    const order_id = req.body.order_id;
    if (!order_id) { res.status(400).json({ error: 'Chybí order_id' }); return; }
    const createResponse = await axios.post(`${API_BASE}/v3/brackets/`,
      { order_id, name: file.originalname },
      { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
    const upload_url = createResponse.data.upload_url ?? createResponse.data.s3PutObjectUrl;
    if (!upload_url) throw new Error('Nepodařilo se získat upload URL');
    const urlParams = new URL(upload_url);
    const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;
    await axios.put(upload_url, file.buffer, {
      headers: { 'Content-Type': contentTypeFromUrl },
      maxBodyLength: Infinity, maxContentLength: Infinity,
    });
    res.json({ bracket_id: createResponse.data.bracket_id ?? createResponse.data.image_id });
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

// ── HDR: Stav orderu ──────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDropboxError(err: any): string {
  try {
    const data = err?.response?.data;
    if (!data) return 'no response data';
    if (Buffer.isBuffer(data)) return data.toString('utf8').slice(0, 300);
    if (typeof data === 'string') return data.slice(0, 300);
    return JSON.stringify(data).slice(0, 300);
  } catch {
    return String(err?.message ?? 'unknown');
  }
}

// ── Dropbox download helper s automatickým namespace fallback ─────────────────
// Pro Team Dropbox účty je potřeba Dropbox-API-Path-Root header.
// Zkusíme nejdřív bez něj, a při 401 zjistíme namespace a zkusíme znovu.
async function dropboxDownload(
  access_token: string,
  dropboxArg: string,
  filename: string,
  namespaceId: string | null
): Promise<Buffer> {
  const makeHeaders = (nsId: string | null) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${access_token}`,
      'Dropbox-API-Arg': dropboxArg,
      'Content-Type': '',
    };
    if (nsId) {
      headers['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'namespace_id', 'namespace_id': nsId });
    }
    return headers;
  };

  const doRequest = async (nsId: string | null) => {
    return axios.post(
      'https://content.dropboxapi.com/2/files/download',
      null,
      {
        headers: makeHeaders(nsId),
        responseType: 'arraybuffer',
        timeout: 10 * 60 * 1000,
      }
    );
  };

  try {
    // Pokus 1: s namespace (pokud ho už máme) nebo bez
    const res = await doRequest(namespaceId);
    return Buffer.from(res.data);
  } catch (err: any) {
    if (err?.response?.status === 401 && !namespaceId) {
      // 401 bez namespace → Team účet, zjistíme namespace a zkusíme znovu
      const nsId = await getDropboxNamespaceId(access_token);
      if (nsId) {
        try {
          const res2 = await doRequest(nsId);
          return Buffer.from(res2.data);
        } catch (err2: any) {
          const status2 = err2?.response?.status;
          const body2 = parseDropboxError(err2);
          console.error(`[dropbox-download] ${filename} CHYBA s namespace HTTP ${status2}: ${body2}`);
          throw err2;
        }
      }
    }
    const status = err?.response?.status;
    const body = parseDropboxError(err);
    const apiResult = err?.response?.headers?.['dropbox-api-result'] ?? '';
    const wwwAuth = err?.response?.headers?.['www-authenticate'] ?? '';
    console.error(`[dropbox-download] ${filename} CHYBA HTTP ${status}: ${body} | api-result: ${apiResult} | www-auth: ${wwwAuth}`);
    throw err;
  }
}

// ── Cloud Import ──────────────────────────────────────────────────────────────
router.post('/cloud-import', async (req: Request, res: Response) => {
  const {
    source, files, access_token,
    settings: rawSettings = {}, hdr_mode = false,
    user_id = null, session_id = null,
  } = req.body;

  if (!source || !files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'Chybí source nebo files' }); return;
  }
  if (source === 'google_drive' && !access_token) {
    res.status(400).json({ error: 'Chybí access_token pro Google Drive' }); return;
  }
  if (source === 'dropbox_oauth' && !access_token) {
    res.status(400).json({ error: 'Chybí access_token pro Dropbox OAuth' }); return;
  }

  let hdr_order_id: string | null = null;
  if (hdr_mode) {
    try {
      const orderRes = await axios.post(`${API_BASE}/v3/orders/`, {},
        { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });
      hdr_order_id = orderRes.data.order_id;
      await supabase.from('orders').insert({
        image_id: `hdr_pending_${hdr_order_id}`,
        filename: files[0]?.name ?? null,
        payment_status: 'pending', amount_czk: PRICE_CZK,
        user_id: user_id || null, session_id: session_id || null,
        hdr_order_id, payment_session_id: `pending_hdr_${hdr_order_id}`,
      });
    } catch (err) {
      console.error('[cloud-import] Chyba při vytváření HDR orderu:', err);
      res.status(500).json({ error: 'Nepodařilo se vytvořit order' }); return;
    }
  }

  const upload_batch_id = hdr_mode ? null : randomUUID();

  res.status(202).json({
    ok: true,
    order_id: hdr_order_id,
    upload_batch_id,
    message: 'Přijato ke zpracování',
  });

  (async () => {
    try {
      // Pro Dropbox Team účty: zjistíme namespace jednou pro celý batch
      // null = osobní účet nebo ještě nezjištěno
      let dropboxNamespaceId: string | null = null;
      let namespaceFetched = false;

      // ← ZMĚNA 2: přidáno sharing_info do type signature
      const streamFileToS3 = async (
        file: {
          url?: string;
          id?: string;
          path_lower?: string;
          name: string;
          mimeType?: string;
          bytes?: number;
          size?: number;
          sharing_info?: { parent_shared_folder_id?: string } | null;
        },
        upload_url: string,
        correctMime: string
      ): Promise<void> => {
        const urlParams = new URL(upload_url);
        const contentTypeFromUrl = urlParams.searchParams.get('content-type') ?? correctMime;

        if (source === 'dropbox_oauth') {
          const dropboxArg = file.path_lower
            ? JSON.stringify({ path: file.path_lower })
            : JSON.stringify({ path: `id:${file.id}` });

          // Zjistíme user root namespace proaktivně jednou pro celý batch —
          // musí být před výpočtem effectiveNamespace, jinak první soubor
          // bez sharing_info dostane null místo správného root namespace
          if (!namespaceFetched) {
            namespaceFetched = true;
            dropboxNamespaceId = await getDropboxNamespaceId(access_token);
          }

          // Priorita: shared folder namespace > user root namespace > null
          const sharedFolderNs = file.sharing_info?.parent_shared_folder_id ?? null;
          const effectiveNamespace = sharedFolderNs ?? dropboxNamespaceId;

          // ── 1. Stáhneme z Dropboxu (s effective namespace) ───────────────
          let buffer: Buffer;
          try {
            buffer = await dropboxDownload(access_token, dropboxArg, file.name, effectiveNamespace);
          } catch (dropboxErr: any) {
            throw dropboxErr;
          }

          // ── 2. Uploadujeme na S3 ──────────────────────────────────────────
          try {
            await axios.put(upload_url, buffer, {
              headers: { 'Content-Type': contentTypeFromUrl, 'Content-Length': buffer.length },
              maxBodyLength: Infinity, maxContentLength: Infinity,
              timeout: 10 * 60 * 1000,
            });
          } catch (s3Err: any) {
            const s3Status = s3Err?.response?.status;
            const s3Body = s3Err?.response?.data
              ? (Buffer.isBuffer(s3Err.response.data)
                ? s3Err.response.data.toString('utf8').slice(0, 300)
                : String(s3Err.response.data).slice(0, 300))
              : s3Err?.message;
            console.error(`[s3-upload] ${file.name} CHYBA HTTP ${s3Status}: ${s3Body}`);
            throw s3Err;
          }

        } else if (source === 'dropbox') {
          const url = (file.url as string).replace('dl=0', 'dl=1');
          if (file.bytes && file.bytes > 0) {
            const sourceResponse = await axios.get(url, {
              responseType: 'stream', decompress: false, timeout: 10 * 60 * 1000,
            });
            await axios.put(upload_url, sourceResponse.data, {
              headers: { 'Content-Type': contentTypeFromUrl, 'Content-Length': file.bytes },
              maxBodyLength: Infinity, maxContentLength: Infinity,
            });
          } else {
            const sourceResponse = await axios.get(url, { responseType: 'arraybuffer', timeout: 10 * 60 * 1000 });
            const buffer = Buffer.from(sourceResponse.data);
            await axios.put(upload_url, buffer, {
              headers: { 'Content-Type': contentTypeFromUrl, 'Content-Length': buffer.length },
              maxBodyLength: Infinity, maxContentLength: Infinity,
            });
          }

        } else {
          const sourceResponse = await axios.get(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: { Authorization: `Bearer ${access_token}` }, responseType: 'arraybuffer', timeout: 10 * 60 * 1000 }
          );
          const buffer = Buffer.from(sourceResponse.data);
          await axios.put(upload_url, buffer, {
            headers: { 'Content-Type': contentTypeFromUrl, 'Content-Length': buffer.length },
            maxBodyLength: Infinity, maxContentLength: Infinity,
          });
        }
      };

      if (hdr_mode && hdr_order_id) {
        const order_id = hdr_order_id;
        const bracketUploads: { file: typeof files[0]; upload_url: string; correctMime: string }[] = [];

        await pLimit(files, 10, async (file) => {
          try {
            const bracketRes = await axios.post(
              `${API_BASE}/v3/brackets/`,
              { order_id, name: file.name },
              { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } }
            );
            const upload_url = bracketRes.data.upload_url ?? bracketRes.data.s3PutObjectUrl;
            if (!upload_url) throw new Error('Nepodařilo se získat upload URL');
            const correctMime = getMimeType(file.name, file.mimeType ?? 'application/octet-stream');
            bracketUploads.push({ file, upload_url, correctMime });
          } catch (err: any) {
            console.error(`[cloud-import] Chyba při registraci bracketu ${file.name}: ${err?.response?.status} ${err?.message}`);
          }
        });

        const uploadConcurrency = source === 'dropbox_oauth' ? 3 : 5;
        const maxAttempts = source === 'dropbox_oauth' ? 1 : 3;

        await pLimit(bracketUploads, uploadConcurrency, async ({ file, upload_url, correctMime }) => {
          let success = false;
          for (let attempt = 0; attempt < maxAttempts && !success; attempt++) {
            try {
              await streamFileToS3(file, upload_url, correctMime);
              success = true;
            } catch (err: any) {
              console.error(`[cloud-import] Bracket ${file.name} pokus ${attempt + 1} selhal: ${err?.response?.status} ${err?.message}`);
              if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
          if (!success) console.error(`[cloud-import] Bracket ${file.name} selhal`);
        });

        const mergeBody: Record<string, unknown> = {
          hdr: true, ai_version: '5.x', enhance: true,
          enhance_type: rawSettings.enhance_type ?? 'neutral',
          sky_replacement: rawSettings.sky_replacement ?? true,
          cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
          vertical_correction: rawSettings.vertical_correction ?? true,
          lens_correction: rawSettings.lens_correction ?? true,
          window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
          upscale: rawSettings.upscale ?? false, privacy: rawSettings.privacy ?? false,
        };
        await axios.post(`${API_BASE}/v3/orders/${order_id}/process`, mergeBody,
          { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });

      } else if (!hdr_mode && upload_batch_id) {
        const validFiles = (files as {
          name: string;
          url?: string;
          id?: string;
          path_lower?: string;
          mimeType?: string;
          bytes?: number;
          size?: number;
          sharing_info?: { parent_shared_folder_id?: string } | null;
        }[]).filter(f => {
          const ext = path.extname(f.name).toLowerCase().replace('.', '');
          if (!ALLOWED_EXTENSIONS.has(ext)) {
            return false;
          }
          return true;
        });

        if (validFiles.length === 0) {
          return;
        }

        const prepared: { image_id: string; upload_url: string; correctMime: string; file: typeof validFiles[0] }[] = [];

        await pLimit(validFiles, 10, async (file) => {
          try {
            const ext = path.extname(file.name).toLowerCase().replace('.', '');
            const correctMime = getMimeType(file.name, file.mimeType ?? 'application/octet-stream');
            const createRes = await axios.post(`${API_BASE}/v3/images/`, {
              image_name: file.name, image_type: ext, ai_version: '5.x', enhance: true,
              enhance_type: rawSettings.enhance_type ?? 'neutral',
              sky_replacement: rawSettings.sky_replacement ?? true,
              cloud_type: rawSettings.cloud_type ?? 'LOW_CLOUD',
              vertical_correction: rawSettings.vertical_correction ?? true,
              lens_correction: rawSettings.lens_correction ?? true,
              window_pull_type: rawSettings.window_pull_type ?? 'WINDOWS_WITH_SKIES',
              upscale: rawSettings.upscale ?? false, privacy: rawSettings.privacy ?? false,
            }, { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' } });

            const { image_id, s3PutObjectUrl: upload_url } = createRes.data;

            await supabase.from('orders').insert({
              image_id, filename: file.name, payment_status: 'pending',
              amount_czk: PRICE_CZK, user_id: user_id || null, session_id: session_id || null,
              payment_session_id: `pending_${image_id}`, upload_batch_id,
            });

            prepared.push({ image_id, upload_url, correctMime, file });
          } catch (createErr: any) {
            console.error(`[cloud-import] Chyba při registraci image pro ${file.name}: ${createErr?.response?.status} ${createErr?.message}`);
          }
        });

        const uploadConcurrency = source === 'dropbox_oauth' ? 3 : 5;
        const maxAttempts = source === 'dropbox_oauth' ? 1 : 3;

        await pLimit(prepared, uploadConcurrency, async (item) => {
          let success = false;
          for (let attempt = 0; attempt < maxAttempts && !success; attempt++) {
            try {
              await streamFileToS3(item.file, item.upload_url, item.correctMime);
              success = true;
            } catch (uploadErr: any) {
              console.error(`[cloud-import] ${item.file.name} pokus ${attempt + 1} selhal: ${uploadErr?.response?.status} ${uploadErr?.message}`);
              if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
          if (!success) {
            console.error(`[cloud-import] ${item.file.name} (${item.image_id}) selhal`);
          }
        });
      }
    } catch (err: any) {
      console.error(`[cloud-import] Fatální chyba: ${err?.message}`);
    }
  })();
});

// ── Souhlas ───────────────────────────────────────────────────────────────────
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

// ── Cron: expiry reminders ────────────────────────────────────────────────────
router.get('/cron/expiry-reminders', async (req: Request, res: Response) => {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    await sendExpiryReminders();
    res.json({ ok: true });
  } catch (err) {
    console.error('Chyba cron jobu:', err);
    res.status(500).json({ error: 'Cron job selhal' });
  }
});

// ── Autoenhance Webhook ───────────────────────────────────────────────────────
router.post('/webhook/autoenhance', async (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
  try {
    const { event, image_id, error, order_id, order_is_processing } = req.body;
    if (event !== 'image_processed' || error) return;

    let order: any = null;

    const { data: directOrder } = await supabase
      .from('orders').select('*').eq('image_id', image_id).maybeSingle();

    if (directOrder) {
      order = directOrder;
    } else if (order_id) {
      const { data: existingById } = await supabase
        .from('orders').select('id').eq('image_id', image_id).maybeSingle();
      if (existingById) {
        return;
      }
      const { data: hdrOrders } = await supabase
        .from('orders').select('*').eq('hdr_order_id', order_id).order('created_at', { ascending: true });
      const pendingRow = (hdrOrders ?? []).find((o: any) => o.image_id === `hdr_pending_${order_id}`);
      const metaRow = (hdrOrders ?? [])[0] ?? null;
      if (!metaRow) { console.error(`[webhook] HDR order ${order_id} nenalezen v DB`); return; }
      if (pendingRow) {
        await supabase.from('orders').update({ image_id }).eq('id', pendingRow.id);
        order = { ...pendingRow, image_id };
      } else {
        await supabase.from('orders').insert({
          image_id, filename: null, payment_status: 'pending', amount_czk: PRICE_CZK,
          user_id: metaRow.user_id, session_id: metaRow.session_id,
          hdr_order_id: order_id, payment_session_id: `pending_${image_id}`,
          upload_batch_id: metaRow.upload_batch_id,
        });
        order = { ...metaRow, image_id };
      }
    }

    if (!order || !order.user_id) return;

    if (order_id) {
      if (order_is_processing) return;
      try {
        const autoenhanceRes = await axios.get(`${API_BASE}/v3/orders/${order_id}`, { headers: { 'x-api-key': API_KEY } });
        const totalImages = (autoenhanceRes.data.images ?? []).length;
        const processedImages = (autoenhanceRes.data.images ?? []).filter((img: { status: string }) => img.status === 'processed');
        const allDone = processedImages.length === totalImages && totalImages > 0 && !autoenhanceRes.data.is_processing;
        if (!allDone) return;
        const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
        if (userData?.user?.email) {
          await resend.emails.send({
            from: process.env.FROM_EMAIL ?? 'noreply@fasthdr.cz',
            to: userData.user.email,
            subject: `Vaše HDR fotografie jsou zpracovány ✓ (${processedImages.length} fotek)`,
            html: notifyBatchEmailHtml(processedImages.length, GOPAY_RETURN_URL),
          });
        }
      } catch (emailErr: any) { console.error(`[webhook] Chyba při odesílání HDR emailu: ${emailErr?.message}`); }
      return;
    }

    if (order.upload_batch_id) {
      const { data: batchOrders } = await supabase
        .from('orders').select('image_id').eq('upload_batch_id', order.upload_batch_id);
      if (batchOrders && batchOrders.length > 1) {
        const statuses = await Promise.allSettled(
          batchOrders.map(async (o) => {
            const r = await axios.get(`${API_BASE}/v3/images/${o.image_id}`, { headers: { 'x-api-key': API_KEY } });
            return r.data.status as string;
          })
        );
        const allDone = statuses.every(s => s.status === 'fulfilled' && ['processed', 'failed', 'error'].includes(s.value));
        if (!allDone) return;
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
        } catch (emailErr: any) { console.error(`[webhook] Chyba při odesílání batch emailu: ${emailErr?.message}`); }
        return;
      }
    }

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
    } catch (emailErr: any) { console.error(`[webhook] Chyba při odesílání emailu: ${emailErr?.message}`); }
  } catch (err: any) { console.error(`[webhook] Fatální chyba: ${err?.message}`); }
});

// ── Notify (fallback) ─────────────────────────────────────────────────────────
router.post('/notify', async (req: Request, res: Response) => {
  try {
    const { user_id, filename, image_id, upload_batch_id } = req.body;
    if (!user_id || !image_id) { res.status(400).json({ error: 'Chybí user_id nebo image_id' }); return; }
    const { data: existing } = await supabase.from('orders').select('id').eq('image_id', image_id).maybeSingle();
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

// ── Email šablony ─────────────────────────────────────────────────────────────
function notifyBatchEmailHtml(count: number, frontendUrl: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zpracování dokončeno — FastHDR</title></head><body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;"><div style="display:none;max-height:0;overflow:hidden;">Všechny vaše fotografie (${count}) byly úspěšně zpracovány.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:0 0 32px;"><img src="${frontendUrl}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;"></td></tr><tr><td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:#1E1535;border:1px solid #2E2350;border-radius:24px;padding:8px 16px;"><span style="font-size:12px;font-weight:600;color:#A990F5;letter-spacing:0.5px;text-transform:uppercase;">● Zpracováno</span></td></tr></table><h1 style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">Vaše fotografie<br>jsou připraveny</h1><p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">Všech <strong style="color:#ffffff;font-weight:600;">${count} fotografií</strong> bylo úspěšně zpracováno pomocí AI modelu v5.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;"><tr><td style="background:#7B5CF0;border-radius:10px;"><a href="${frontendUrl}/dashboard" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Zobrazit fotografie →</a></td></tr></table><div style="height:1px;background:#22222E;margin:0 0 24px;"></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:120px;">Počet fotek</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${count}</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Cena za fotku</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${PRICE_CZK} Kč</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Dostupnost</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">7 dní od vytvoření</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Podpora</td><td style="padding:8px 0;font-size:13px;"><a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;font-weight:500;">info@fasthdr.cz</a></td></tr></table></td></tr><tr><td style="padding:24px 32px 0;"><p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">Potřebujete pomoc? Napište nám na <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;">info@fasthdr.cz</a></p></td></tr><tr><td style="padding:40px 32px 16px;border-top:1px solid #16161F;"><p style="font-size:11px;line-height:1.7;color:#555568;margin:24px 0 0;text-align:center;"><strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br><a href="${frontendUrl}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a> · <a href="${frontendUrl}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a> · <a href="${frontendUrl}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a></p><p style="font-size:11px;color:#444455;margin:16px 0 0;text-align:center;">© ${year} FASTHDR. Všechna práva vyhrazena.</p></td></tr></table></td></tr></table></body></html>`;
}

function notifyEmailHtml(filename: string, imageId: string, frontendUrl: string): string {
  const safeName = filename ?? 'bez názvu';
  const safeRef = filename ?? imageId;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Zpracování dokončeno — FastHDR</title></head><body style="margin:0;padding:0;background:#09090F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#ffffff;"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#09090F;">Vaše fotografie ${safeName} byla úspěšně zpracována.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090F;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:0 0 32px;"><img src="${frontendUrl}/logo-dark.png" alt="FASTHDR" width="160" style="display:block;height:auto;border:0;"></td></tr><tr><td style="background:linear-gradient(180deg,#13131C 0%,#0F0F18 100%);border:1px solid #22222E;border-radius:16px;padding:40px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="background:#1E1535;border:1px solid #2E2350;border-radius:24px;padding:8px 16px;"><span style="font-size:12px;font-weight:600;color:#A990F5;letter-spacing:0.5px;text-transform:uppercase;">● Zpracováno</span></td></tr></table><h1 style="font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;margin:0 0 12px;letter-spacing:-0.02em;">Vaše fotografie<br>je připravena</h1><p style="font-size:15px;line-height:1.6;color:#AAAABC;margin:0 0 32px;">Soubor <strong style="color:#ffffff;font-weight:600;">${safeName}</strong> byl úspěšně zpracován pomocí AI modelu v5.</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;"><tr><td style="background:#7B5CF0;border-radius:10px;"><a href="${frontendUrl}/dashboard" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Zobrazit fotografii →</a></td></tr></table><div style="height:1px;background:#22222E;margin:0 0 24px;"></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;width:120px;">Soubor</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;word-break:break-all;">${safeRef}</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Cena</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">${PRICE_CZK} Kč</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Dostupnost</td><td style="padding:8px 0;font-size:13px;color:#ffffff;font-weight:500;">7 dní od vytvoření</td></tr><tr><td style="padding:8px 0;font-size:13px;color:#8888A0;">Podpora</td><td style="padding:8px 0;font-size:13px;"><a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;font-weight:500;">info@fasthdr.cz</a></td></tr></table></td></tr><tr><td style="padding:24px 32px 0;"><p style="font-size:13px;line-height:1.6;color:#8888A0;margin:0;text-align:center;">Potřebujete pomoc? Napište nám na <a href="mailto:info@fasthdr.cz" style="color:#A990F5;text-decoration:none;">info@fasthdr.cz</a></p></td></tr><tr><td style="padding:40px 32px 16px;border-top:1px solid #16161F;"><p style="font-size:11px;line-height:1.7;color:#555568;margin:24px 0 0;text-align:center;"><strong style="color:#8888A0;">FASTHDR</strong> · Profesionální AI úprava fotografií<br>Filip Zemek · IČO: 23584203 · Drnovec 1, 471 54 Cvikov<br><a href="${frontendUrl}" style="color:#8888A0;text-decoration:none;">fasthdr.cz</a> · <a href="${frontendUrl}/podminky" style="color:#8888A0;text-decoration:none;">Podmínky</a> · <a href="${frontendUrl}/ochrana-soukromi" style="color:#8888A0;text-decoration:none;">Ochrana soukromí</a></p><p style="font-size:11px;color:#444455;margin:16px 0 0;text-align:center;">© ${year} FASTHDR. Všechna práva vyhrazena.</p></td></tr></table></body></html>`;
}

export default router;