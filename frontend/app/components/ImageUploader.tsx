'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../lib/config';
import { supabase } from '../lib/supabase';
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

const sendNotification = async (userId: string, filename: string, imageId: string) => {
  try {
    await fetch(`${API_URL}/api/enhance/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, filename, image_id: imageId }),
    });
  } catch {
    // Notifikace není kritická — ignoruj chybu
  }
};

export default function ImageUploader() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [consentModal, setConsentModal] = useState<PhotoItem | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

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
      try {
        setSettings(JSON.parse(saved));
      } catch { }
    }
  }, []);

  const isProcessing = photos.some(p => p.status === 'uploading' || p.status === 'processing');

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
      const formData = new FormData();
      formData.append('image', item.file);
      formData.append('settings', JSON.stringify(currentSettings));

      const uploadRes = await fetch(`${API_URL}/api/enhance/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload selhal');
      const { image_id } = await uploadRes.json();

      updatePhoto(item.id, { status: 'processing' });
      animateProgress(item.id, 30, 85, 8000);

      await pollStatus(item.id, image_id, item.file.name);
    } catch {
      updatePhoto(item.id, { status: 'error', error: 'Zpracování selhalo', progress: 0 });
    }
  }, [updatePhoto, animateProgress]);

  const processHdrGroup = useCallback(async (
    items: PhotoItem[],
    currentSettings: Settings
  ) => {
    items.forEach(item => updatePhoto(item.id, { status: 'uploading', progress: 0 }));

    try {
      const orderRes = await fetch(`${API_URL}/api/enhance/hdr/order`, {
        method: 'POST',
      });
      if (!orderRes.ok) throw new Error('Nepodařilo se vytvořit order');
      const { order_id } = await orderRes.json();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const formData = new FormData();
        formData.append('image', item.file);
        formData.append('order_id', order_id);
        formData.append('settings', JSON.stringify(currentSettings));

        const uploadRes = await fetch(`${API_URL}/api/enhance/upload-bracket`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) throw new Error(`Upload bracketu ${item.file.name} selhal`);

        const progress = Math.round(((i + 1) / items.length) * 40);
        items.forEach(it => updatePhoto(it.id, { progress }));
      }

      await fetch(`${API_URL}/api/enhance/hdr/order/${order_id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number_of_brackets: currentSettings.hdr_brackets === 'auto'
            ? undefined
            : currentSettings.hdr_brackets,
          settings: currentSettings,
        }),
      });

      items.forEach(it => updatePhoto(it.id, { status: 'processing', progress: 45 }));
      await pollOrderStatus(order_id, items);

    } catch (err) {
      console.error(err);
      items.forEach(it => updatePhoto(it.id, {
        status: 'error',
        error: 'HDR zpracování selhalo',
        progress: 0,
      }));
    }
  }, [updatePhoto]);

  const pollOrderStatus = (orderId: string, items: PhotoItem[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      let progressVal = 45;

      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/enhance/hdr/order/${orderId}/status`);
          const { is_merging, is_processing, image_ids } = await res.json();

          if (progressVal < 90) {
            progressVal += 1;
            items.forEach(it => updatePhoto(it.id, { progress: progressVal }));
          }

          const done = !is_merging && !is_processing && image_ids?.length > 0;

          if (done) {
            clearInterval(interval);

            updatePhoto(items[0].id, {
              status: 'done',
              progress: 100,
              enhancedUrl: `${API_URL}/api/enhance/enhanced/${image_ids[0]}`,
            });

            items.slice(1).forEach(it => updatePhoto(it.id, {
              status: 'done',
              progress: 100,
              enhancedUrl: null,
            }));

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await sendNotification(user.id, items[0].file.name, image_ids[0]);
            }

            resolve();
          }
        } catch {
          clearInterval(interval);
          items.forEach(it => updatePhoto(it.id, {
            status: 'error', error: 'Chyba sítě', progress: 0,
          }));
          reject();
        }
      }, 3000);
    });
  };

  const pollStatus = (photoId: string, imageId: string, filename: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/enhance/status/${imageId}`);
          const { status } = await res.json();
          if (status === 'processed') {
            clearInterval(interval);
            updatePhoto(photoId, { progress: 95 });
            setTimeout(async () => {
              updatePhoto(photoId, {
                status: 'done', progress: 100,
                enhancedUrl: `${API_URL}/api/enhance/enhanced/${imageId}`,
              });

              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await sendNotification(user.id, filename, imageId);
              }

              resolve();
            }, 300);
          } else if (status === 'failed') {
            clearInterval(interval);
            updatePhoto(photoId, { status: 'error', error: 'AI zpracování selhalo', progress: 0 });
            reject();
          }
        } catch {
          clearInterval(interval);
          updatePhoto(photoId, { status: 'error', error: 'Chyba sítě', progress: 0 });
          reject();
        }
      }, 2000);
    });
  };

  // ─── Checkout ────────────────────────────────────────────
  const handleCheckout = async (photo: PhotoItem) => {
    try {
      setCheckoutLoading(true);
      const imageId = photo.enhancedUrl?.split('/').at(-1)?.split('?')[0];
      if (!imageId) return;

      const { data: { user } } = await supabase.auth.getUser();

      const res = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_id: imageId,
          filename: photo.file.name,
          user_id: user?.id ?? null,
          email: user?.email ?? null,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Chyba při vytváření platby:', err);
    } finally {
      setCheckoutLoading(false);
    }
  };
  // ─────────────────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const rawExts = ['.arw', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.sr2', '.srf', '.raf', '.orf', '.rw2', '.pef', '.kdc', '.erf', '.dng', '.iiq', '.mos', '.mef', '.fff', '.3fr', '.x3f', '.rwl', '.srw'];

    const validFiles = Array.from(files).filter(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return file.type.startsWith('image/') || rawExts.includes(ext);
    });

    if (validFiles.length === 0) return;

    const captured = { ...settings };

    const groupId = crypto.randomUUID();
    const newItems: PhotoItem[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      enhancedUrl: null,
      status: 'waiting' as FileStatus,
      progress: 0,
      error: null,
      hdr_group_id: captured.hdr_mode ? groupId : undefined,
    }));
    setPhotos(prev => [...prev, ...newItems]);

    if (captured.hdr_mode) {
      (async () => { await processHdrGroup(newItems, captured); })();
    } else {
      (async () => {
        for (const item of newItems) {
          await processPhoto(item, captured);
        }
      })();
    }
  }, [settings, processPhoto, processHdrGroup]);

  // ── Uzamčení drag & drop při zpracování ──────────────────
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
  // ─────────────────────────────────────────────────────────

  const handleReset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
  };

  // Pomocná funkce — ulož souhlas na backend
  const saveConsent = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`${API_URL}/api/enhance/consent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  // Kontrola existujícího souhlasu
  const checkConsent = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from('user_consents')
      .select('agreed_to_terms_at')
      .eq('user_id', user.id)
      .single();

    return !!data?.agreed_to_terms_at;
  };

  return (
    <section id="editor" style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 2rem 2rem' }}>
      <div className="tag">Editor</div>
      <h2 style={{
        fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
        fontWeight: 600, letterSpacing: '-0.02em',
        marginBottom: '2rem', color: 'var(--text-primary)',
      }}>
        Nahrajte fotografie
      </h2>

      <SettingsPanel settings={settings} onChange={setSettings} disabled={isProcessing} />

      {/* Drop zone — uzamčena při zpracování */}
      <label
        onDragOver={(e) => { e.preventDefault(); if (!isProcessing) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          display: 'flex', flexDirection: 'column' as const,
          alignItems: 'center', justifyContent: 'center',
          border: `1px dashed ${isDragging ? 'var(--drop-border-active)' : 'var(--drop-border)'}`,
          borderRadius: 'var(--radius)',
          padding: '3.5rem 2rem',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          background: isDragging ? 'var(--accent-muted)' : 'var(--drop-bg)',
          opacity: isProcessing ? 0.5 : 1,
          pointerEvents: isProcessing ? 'none' : 'auto',
          transition: 'all 0.2s', marginBottom: '2rem',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--accent-muted)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, marginBottom: '1rem',
        }}>
          ↑
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', marginBottom: '0.4rem', fontWeight: 500 }}>
          {isProcessing ? 'Probíhá zpracování…' : 'Přetáhněte fotografie sem'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {isProcessing ? 'Počkejte na dokončení zpracování' : 'nebo klikněte pro výběr souborů'}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '0.75rem', letterSpacing: '0.02em' }}>
          JPG · PNG · TIFF · WEBP · HEIC · RAW (ARW, CR2, CR3, NEF, DNG…) · max. 200 MB
        </p>
        <input
          type="file" multiple
          accept="image/*,.arw,.cr3,.cr2,.crw,.nef,.nrw,.sr2,.srf,.raf,.orf,.rw2,.pef,.kdc,.erf,.dng,.iiq,.mos,.mef,.fff,.3fr,.x3f,.rwl,.srw"
          onChange={handleFileInput}
          disabled={isProcessing}
          style={{ display: 'none' }}
        />
      </label>

      {/* CloudPicker — odsazení 2rem a uzamčení při zpracování */}
      <div style={{ marginBottom: '2rem' }}>
        <CloudPicker onFiles={(files) => { if (!isProcessing) addFiles(files); }} />
      </div>

      {/* Tabulka */}
      {photos.length > 0 && (
        <>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Náhled', 'Soubor', 'Stav', 'Průběh', 'Akce'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '0.65rem 1rem',
                      fontWeight: 600, fontSize: 11, letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {photos.map((photo, i) => (
                  <tr key={photo.id} style={{
                    borderBottom: i < photos.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'var(--bg)',
                  }}>
                    {/* Náhled */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div
                        onClick={() => photo.enhancedUrl
                          ? setLightbox(photo.enhancedUrl)
                          : undefined
                        }
                        style={{
                          width: 60, height: 44, borderRadius: 4, overflow: 'hidden',
                          cursor: photo.enhancedUrl ? 'pointer' : 'default',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {photo.enhancedUrl ? (
                          <img
                            src={photo.enhancedUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: 20, opacity: 0.3 }}>🖼️</span>
                        )}
                      </div>
                    </td>

                    {/* Soubor */}
                    <td style={{ padding: '0.75rem 1rem', maxWidth: 220 }}>
                      <p style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {photo.file.name}
                      </p>
                      {photo.hdr_group_id && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase' as const,
                          color: 'var(--accent)',
                          background: 'var(--accent-muted)',
                          border: '1px solid var(--accent-glow)',
                          padding: '1px 6px',
                          borderRadius: 999,
                          marginTop: 3,
                          display: 'inline-block',
                        }}>
                          HDR
                        </span>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {(photo.file.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </td>

                    {/* Stav */}
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' as const }}>
                      <span style={{ color: statusColor[photo.status] }}>
                        {photo.error ?? statusLabel[photo.status]}
                      </span>
                    </td>

                    {/* Progress */}
                    <td style={{ padding: '0.75rem 1rem', minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          flex: 1, height: 2, background: 'var(--progress-bg)',
                          borderRadius: 999, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', width: `${photo.progress}%`,
                            background: photo.status === 'done' ? 'var(--progress-done)' : 'var(--progress-fill)',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' as const }}>
                          {photo.progress}%
                        </span>
                      </div>
                    </td>

                    {/* Akce */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {photo.status === 'done' && photo.enhancedUrl ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setLightbox(photo.enhancedUrl!)}
                            className="btn"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            Náhled
                          </button>
                          <button
                            onClick={async () => {
                              const hasConsent = await checkConsent();
                              if (hasConsent) {
                                handleCheckout(photo);
                              } else {
                                setConsentModal(photo);
                              }
                            }}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={checkoutLoading}
                          >
                            {checkoutLoading ? 'Načítám…' : 'Koupit & Stáhnout'}
                          </button>
                        </div>
                      ) : photo.status === 'done' && photo.hdr_group_id ? (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Sloučeno do HDR
                        </span>
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
            <button onClick={handleReset} className="btn">
              Vymazat vše
            </button>
          </div>
        </>
      )}

      {/* Consent modal */}
      {consentModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1001,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 12,
            width: 480,
            padding: '2rem',
            border: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              Před dokončením objednávky
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Soubor: <strong style={{ color: 'var(--text-secondary)' }}>{consentModal.file.name}</strong>
            </p>

            <ConsentCheckboxes
              agreedToTerms={agreedToTerms}
              agreedToPrivacy={agreedToPrivacy}
              onTermsChange={setAgreedToTerms}
              onPrivacyChange={setAgreedToPrivacy}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setConsentModal(null);
                  setAgreedToTerms(false);
                  setAgreedToPrivacy(false);
                }}
              >
                Zrušit
              </button>
              <button
                className="btn btn-primary"
                disabled={!agreedToTerms || !agreedToPrivacy || checkoutLoading}
                onClick={async () => {
                  setConsentModal(null);
                  await saveConsent();
                  handleCheckout(consentModal);
                }}
              >
                {checkoutLoading ? 'Načítám…' : 'Pokračovat k platbě'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
        }}>
          <img src={lightbox} alt="Náhled" style={{
            maxWidth: '90vw', maxHeight: '90vh',
            objectFit: 'contain', borderRadius: 4,
          }} />
          <button onClick={() => setLightbox(null)} style={{
            position: 'fixed', top: 20, right: 24,
            background: 'none', border: 'none',
            color: '#fff', fontSize: 24, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
    </section>
  );
}