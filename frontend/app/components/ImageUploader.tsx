'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../lib/config';
import { supabase } from '../lib/supabase';
import '../styles/ImageUploader-styles.css';
import CloudPicker from './CloudPicker';
import ConsentCheckboxes from './ConsentCheckboxes';
import SettingsPanel, { Settings } from './SettingsPanel';

type FileStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'error';

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  enhancedUrl: string | null;
  status: FileStatus;
  progress: number;
  error: string | null;
  hdr_group_id?: string;
  upload_batch_id?: string;
}

const DEFAULT_SETTINGS: Settings = {
  enhance_type: 'neutral',
  sky_replacement: true,
  cloud_type: 'LOW_CLOUD',
  vertical_correction: true,
  lens_correction: true,
  window_pull_type: 'WINDOWS_WITH_SKIES',
  upscale: false,
  privacy: false,
  hdr_mode: false,
  hdr_brackets: 'auto',
};

// Maximální počet HDR skupin zpracovávaných paralelně.
// Chrání Railway před zahlcením při velkém počtu skupin (např. 36 skupin při 180 fotkách / 5 bracketech).
const HDR_GROUP_CONCURRENCY = 3;

const getSessionId = (): string => {
  const key = 'fasthdr_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
};

export default function ImageUploader() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hoveredDrop, setHoveredDrop] = useState(false);
  const [consentModal, setConsentModal] = useState<PhotoItem | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);

  // ── Koordinace multi-group HDR redirect pro nepřihlášené uživatele ────────
  const hdrSessionRef = useRef<{
    totalGroups: number;
    collectedOrderIds: string[];
    done: number;
  } | null>(null);

  const statusLabel: Record<FileStatus, string> = {
    waiting: 'Čeká', uploading: 'Nahrávám…',
    processing: 'Zpracovávám…', done: 'Hotovo', error: 'Chyba',
  };

  const statusColor: Record<FileStatus, string> = {
    waiting: 'var(--text-muted)', uploading: 'var(--text-secondary)',
    processing: 'var(--text-secondary)', done: 'var(--progress-done)', error: '#ef4444',
  };

  useEffect(() => {
    sessionStorage.setItem('pending_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const saved = sessionStorage.getItem('pending_settings');
    if (saved) {
      try { setSettings(JSON.parse(saved)); } catch { }
    }
  }, []);

  const isProcessing = photos.some(
    p => p.status === 'waiting' || p.status === 'uploading' || p.status === 'processing'
  );

  const updatePhoto = useCallback((id: string, patch: Partial<PhotoItem>) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const animateProgress = useCallback((id: string, start: number, end: number, duration: number) => {
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const ratio = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      updatePhoto(id, { progress: Math.round(start + (end - start) * eased) });
      if (ratio < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [updatePhoto]);

  const processPhoto = useCallback(async (item: PhotoItem, currentSettings: Settings) => {
    updatePhoto(item.id, { status: 'uploading', progress: 0 });
    animateProgress(item.id, 0, 30, 800);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sessionId = getSessionId();

      const formData = new FormData();
      formData.append('image', item.file);
      formData.append('settings', JSON.stringify(currentSettings));
      formData.append('session_id', sessionId);
      if (user) formData.append('user_id', user.id);
      if (item.upload_batch_id) formData.append('upload_batch_id', item.upload_batch_id);

      const uploadRes = await fetch(`${API_URL}/api/enhance/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        const errMsg = uploadRes.status === 415
          ? (errData.error ?? 'Nepodporovaný formát souboru.')
          : 'Upload selhal';
        throw new Error(errMsg);
      }
      const { image_id } = await uploadRes.json();

      if (!user) {
        window.location.href = `/order/${image_id}`;
        return;
      }

      updatePhoto(item.id, { status: 'processing', progress: 50 });

      const pollFallback = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/enhance/status/${image_id}`);
          const { status } = await res.json();
          if (status === 'processed') {
            clearInterval(pollFallback);
            updatePhoto(item.id, { status: 'done', progress: 100, enhancedUrl: `${API_URL}/api/enhance/enhanced/${image_id}` });
          } else if (status === 'failed' || status === 'error') {
            clearInterval(pollFallback);
            updatePhoto(item.id, { status: 'error', error: 'AI zpracování selhalo', progress: 0 });
          }
        } catch { clearInterval(pollFallback); }
      }, 3000);

      setTimeout(() => clearInterval(pollFallback), 10 * 60 * 1000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Zpracování selhalo';
      updatePhoto(item.id, { status: 'error', error: msg, progress: 0 });
    }
  }, [updatePhoto, animateProgress]);

  const processHdrGroup = useCallback(async (
    items: PhotoItem[],
    currentSettings: Settings,
    onOrderReady?: (order_id: string) => void,
  ) => {
    items.forEach(item => updatePhoto(item.id, { status: 'uploading', progress: 0 }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sessionId = getSessionId();

      const orderRes = await fetch(`${API_URL}/api/enhance/hdr/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id ?? null, session_id: sessionId, filename: items[0].file.name }),
      });
      if (!orderRes.ok) throw new Error('Nepodařilo se vytvořit order');
      const { order_id } = await orderRes.json();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Retry 2× při selhání — zabrání pádu při dočasném výpadku sítě
        let uploadRes: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const formData = new FormData();
          formData.append('image', item.file);
          formData.append('order_id', order_id);
          formData.append('settings', JSON.stringify(currentSettings));
          uploadRes = await fetch(`${API_URL}/api/enhance/upload-bracket`, { method: 'POST', body: formData });
          if (uploadRes.ok) break;
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }

        if (!uploadRes || !uploadRes.ok) {
          const errData = await uploadRes?.json().catch(() => ({})) ?? {};
          const errMsg = uploadRes?.status === 415
            ? (errData.error ?? 'Nepodporovaný formát souboru.')
            : `Upload bracketu ${item.file.name} selhal`;
          throw new Error(errMsg);
        }

        const progress = Math.round(((i + 1) / items.length) * 40);
        items.forEach(it => updatePhoto(it.id, { progress }));
      }

      await fetch(`${API_URL}/api/enhance/hdr/order/${order_id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number_of_brackets: currentSettings.hdr_brackets === 'auto' ? undefined : currentSettings.hdr_brackets,
          settings: currentSettings,
        }),
      });

      if (!user) {
        onOrderReady?.(order_id);
        return;
      }

      items.forEach(it => updatePhoto(it.id, { status: 'processing', progress: 50 }));

      const pollFallback = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/enhance/hdr/order/${order_id}/status`);
          const { is_merging, is_processing, image_ids } = await res.json();
          const done = !is_merging && !is_processing && image_ids?.length > 0;
          if (done) {
            clearInterval(pollFallback);
            updatePhoto(items[0].id, { status: 'done', progress: 100, enhancedUrl: `${API_URL}/api/enhance/enhanced/${image_ids[0]}` });
            items.slice(1).forEach(it => updatePhoto(it.id, { status: 'done', progress: 100, enhancedUrl: null }));
          }
        } catch { clearInterval(pollFallback); }
      }, 3000);

      setTimeout(() => clearInterval(pollFallback), 10 * 60 * 1000);

    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'HDR zpracování selhalo';
      items.forEach(it => updatePhoto(it.id, { status: 'error', error: msg, progress: 0 }));
      // I při chybě oznámit koordinátoru aby se redirect neblokoval
      onOrderReady?.('');
    }
  }, [updatePhoto]);

  const handleCheckout = async (photo: PhotoItem) => {
    try {
      setCheckoutLoading(true);
      const imageId = photo.enhancedUrl?.split('/').at(-1)?.split('?')[0];
      if (!imageId) return;
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_id: imageId, filename: photo.file.name, user_id: user?.id ?? null, email: user?.email ?? null }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Chyba při vytváření platby:', err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const rawExts = ['.arw', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.sr2', '.srf', '.raf', '.orf', '.rw2', '.pef', '.kdc', '.erf', '.dng', '.iiq', '.mos', '.mef', '.fff', '.3fr', '.x3f', '.rwl', '.srw'];

    const allFiles = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: { file: File; reason: string }[] = [];

    allFiles.forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (file.type === 'image/svg+xml' || ext === '.svg') {
        invalidFiles.push({ file, reason: 'SVG není podporováno. Nahrajte JPG, PNG, TIFF, WEBP, HEIC nebo RAW.' });
      } else if (file.type.startsWith('image/') || rawExts.includes(ext)) {
        validFiles.push(file);
      } else {
        invalidFiles.push({ file, reason: `Nepodporovaný formát (${ext || file.type}). Povoleny jsou JPG, PNG, TIFF, WEBP, HEIC a RAW.` });
      }
    });

    const captured = { ...settings };

    const invalidItems: PhotoItem[] = invalidFiles.map(({ file, reason }) => ({
      id: crypto.randomUUID(), file,
      previewUrl: '',
      enhancedUrl: null, status: 'error' as FileStatus,
      progress: 0, error: reason,
      hdr_group_id: undefined,
      upload_batch_id: undefined,
    }));

    if (validFiles.length === 0) {
      setPhotos(prev => [...prev, ...invalidItems]);
      return;
    }

    if (captured.hdr_mode) {
      const bracketsPerGroup = captured.hdr_brackets === 'auto'
        ? validFiles.length
        : Number(captured.hdr_brackets);

      const allGroups: PhotoItem[][] = [];
      const allValidItems: PhotoItem[] = [];

      for (let i = 0; i < validFiles.length; i += bracketsPerGroup) {
        const groupFiles = validFiles.slice(i, i + bracketsPerGroup);
        const groupId = crypto.randomUUID();

        const groupItems: PhotoItem[] = groupFiles.map(file => ({
          id: crypto.randomUUID(), file,
          previewUrl: URL.createObjectURL(file),
          enhancedUrl: null,
          status: 'uploading' as FileStatus,
          progress: 0, error: null,
          hdr_group_id: groupId,
          upload_batch_id: undefined,
        }));

        allGroups.push(groupItems);
        allValidItems.push(...groupItems);
      }

      setPhotos(prev => [...prev, ...allValidItems, ...invalidItems]);

      const totalGroups = allGroups.length;

      if (totalGroups === 1) {
        // Jedna skupina — přímý redirect
        processHdrGroup(allGroups[0], captured, (order_id) => {
          if (order_id) window.location.href = `/order/hdr_pending_${order_id}`;
        });
      } else {
        // Více skupin — koordinátor + omezení konkurence
        hdrSessionRef.current = {
          totalGroups,
          collectedOrderIds: [],
          done: 0,
        };

        // ── Omezení konkurence: max HDR_GROUP_CONCURRENCY skupin najednou ──
        // Zabrání zahlcení Railway při velkém počtu skupin (např. 36 skupin).
        // Skupiny se zpracovávají ve vlnách po HDR_GROUP_CONCURRENCY.
        const onOrderReady = (order_id: string) => {
          const session = hdrSessionRef.current;
          if (!session) return;

          session.done++;
          if (order_id) session.collectedOrderIds.push(`hdr_pending_${order_id}`);

          if (session.done === session.totalGroups) {
            const ids = session.collectedOrderIds;
            if (ids.length === 0) {
              // Všechny skupiny selhaly — přesměruj na hlavní stránku s chybou
              window.location.href = '/?hdr_error=1';
              return;
            }
            const [primary, ...rest] = ids;
            const url = rest.length > 0
              ? `${primary}?groups=${rest.join(',')}`
              : primary;
            window.location.href = `/order/${url}`;
          }
        };

        // Spusť skupiny po dávkách HDR_GROUP_CONCURRENCY
        (async () => {
          for (let i = 0; i < allGroups.length; i += HDR_GROUP_CONCURRENCY) {
            const batch = allGroups.slice(i, i + HDR_GROUP_CONCURRENCY);
            await Promise.all(batch.map(group => processHdrGroup(group, captured, onOrderReady)));
          }
        })();
      }

    } else {
      const batchId = crypto.randomUUID();

      const validItems: PhotoItem[] = validFiles.map(file => ({
        id: crypto.randomUUID(), file,
        previewUrl: URL.createObjectURL(file),
        enhancedUrl: null,
        status: 'uploading' as FileStatus,
        progress: 0, error: null,
        hdr_group_id: undefined,
        upload_batch_id: batchId,
      }));

      setPhotos(prev => [...prev, ...validItems, ...invalidItems]);

      (async () => {
        for (const item of validItems) {
          await processPhoto(item, captured);
        }
      })();
    }
  }, [settings, processPhoto, processHdrGroup]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    addFiles(e.dataTransfer.files);
  }, [addFiles, isProcessing]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleReset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    hdrSessionRef.current = null;
  };

  const saveConsent = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${API_URL}/api/enhance/consent`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    });
  };

  const checkConsent = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from('user_consents').select('agreed_to_terms_at').eq('user_id', user.id).single();
    return !!data?.agreed_to_terms_at;
  };

  return (
    <section id="editor" className="uploader-section" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 2rem 2rem' }}>
      <div className="glass-card" style={{ padding: 'clamp(2rem, 5vw, 3.5rem)' }}>
        <h2 className="uploader-title" style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '2.5rem', color: 'var(--text-primary)' }}>
          Nahrajte fotografie
        </h2>

        <SettingsPanel key={settingsKey} settings={settings} onChange={setSettings} disabled={isProcessing} />

        <label
          className={`dz-modern${isDragging ? ' dz-dragging' : ''}${isProcessing ? ' dz-disabled' : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onMouseEnter={() => { if (!isProcessing) setHoveredDrop(true); }}
          onMouseLeave={() => setHoveredDrop(false)}
        >
          <div className="dz-icon">↑</div>
          <p className="dz-title">{isProcessing ? 'Probíhá zpracování…' : 'Přetáhněte fotografie sem'}</p>
          <p className="dz-subtitle">{isProcessing ? 'Počkejte na dokončení zpracování' : 'nebo klikněte pro výběr souborů'}</p>
          <p className="dz-formats">JPG · PNG · TIFF · WEBP · HEIC · RAW (ARW, CR2, CR3, NEF, DNG…) · max. 200 MB</p>
          <input
            type="file" multiple
            accept="image/*,.arw,.cr3,.cr2,.crw,.nef,.nrw,.sr2,.srf,.raf,.orf,.rw2,.pef,.kdc,.erf,.dng,.iiq,.mos,.mef,.fff,.3fr,.x3f,.rwl,.srw"
            onChange={handleFileInput}
            disabled={isProcessing}
            style={{ display: 'none' }}
          />
        </label>

        <div>
          <CloudPicker onFiles={(files) => { if (!isProcessing) addFiles(files); }} />
        </div>

        {photos.length > 0 && (
          <>
            <div className="upload-table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    {['Náhled', 'Soubor', 'Stav', 'Průběh', 'Akce'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {photos.map((photo, i) => (
                    <tr key={photo.id} className="upload-row" style={{ borderBottom: i < photos.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--bg)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div
                          onClick={() => photo.enhancedUrl ? setLightbox(photo.enhancedUrl) : undefined}
                          style={{ width: 60, height: 44, borderRadius: 6, overflow: 'hidden', cursor: photo.enhancedUrl ? 'pointer' : 'default', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s, border-color 0.2s' }}
                        >
                          {photo.enhancedUrl
                            ? <img src={photo.enhancedUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 20, opacity: 0.3 }}>🖼️</span>}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: 220 }}>
                        <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{photo.file.name}</p>
                        {photo.hdr_group_id && (
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--accent)', background: 'var(--accent-muted)', border: '1px solid var(--accent-glow)', padding: '1px 6px', borderRadius: 999, marginTop: 3, display: 'inline-block' }}>HDR</span>
                        )}
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{(photo.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' as const }}>
                        <span style={{ color: statusColor[photo.status], fontWeight: 500 }}>{photo.error ?? statusLabel[photo.status]}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 3, background: 'var(--progress-bg)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${photo.progress}%`, background: photo.status === 'done' ? 'var(--progress-done)' : 'linear-gradient(90deg, #6B47DC, #A78BFA)', transition: 'width 0.3s ease', boxShadow: photo.status === 'processing' ? '0 0 8px rgba(139,92,246,0.5)' : 'none' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{photo.progress}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {photo.status === 'done' && photo.enhancedUrl ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setLightbox(photo.enhancedUrl!)} className="btn" style={{ padding: '4px 10px', fontSize: 12 }}>Náhled</button>
                            <button
                              onClick={async () => {
                                const hasConsent = await checkConsent();
                                if (hasConsent) { handleCheckout(photo); } else { setConsentModal(photo); }
                              }}
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              disabled={checkoutLoading}
                            >
                              {checkoutLoading ? 'Načítám…' : 'Koupit & Stáhnout'}
                            </button>
                          </div>
                        ) : photo.status === 'processing' ? (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pošleme email až bude hotovo</span>
                        ) : photo.status === 'done' && photo.hdr_group_id ? (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sloučeno do HDR</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={handleReset} className="btn">Vymazat vše</button>
            </div>
          </>
        )}
      </div>

      {consentModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: 480, padding: '2rem', border: '1px solid var(--border)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Před dokončením objednávky</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Soubor: <strong style={{ color: 'var(--text-secondary)' }}>{consentModal.file.name}</strong>
            </p>
            <ConsentCheckboxes
              key={consentModal.id}
              agreedToTerms={agreedToTerms}
              agreedToPrivacy={agreedToPrivacy}
              onTermsChange={setAgreedToTerms}
              onPrivacyChange={setAgreedToPrivacy}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn" onClick={() => { setConsentModal(null); setAgreedToTerms(false); setAgreedToPrivacy(false); }}>Zrušit</button>
              <button
                className="btn btn-primary"
                disabled={!agreedToTerms || !agreedToPrivacy || checkoutLoading}
                onClick={async () => { setConsentModal(null); await saveConsent(); handleCheckout(consentModal); }}
              >
                {checkoutLoading ? 'Načítám…' : 'Pokračovat k platbě'}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', backdropFilter: 'blur(8px)' }}>
          <img src={lightbox} alt="Náhled" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }} />
          <button onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 20, right: 24, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>✕</button>
        </div>
      )}
    </section>
  );
}