'use client';

import Script from 'next/script';
import { useCallback, useRef, useState } from 'react';
import { API_URL } from '../lib/config';
import { supabase } from '../lib/supabase';
import type { Settings } from './SettingsPanel';

interface Props {
    onFiles: (files: File[]) => void;
    settings?: Settings;
    hdrMode?: boolean;
}

declare global {
    interface Window {
        Dropbox: {
            choose: (options: {
                success: (files: { link: string; name: string; bytes: number }[]) => void;
                cancel: () => void;
                linkType: string;
                multiselect: boolean;
                extensions: string[];
            }) => void;
        };
        google: {
            accounts: {
                oauth2: {
                    initTokenClient: (config: {
                        client_id: string;
                        scope: string;
                        callback: (response: { access_token: string }) => void;
                    }) => { requestAccessToken: () => void };
                };
            };
        };
        gapi: {
            load: (api: string, callback: () => void) => void;
            picker: any;
        };
    }
}

const DROPBOX_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic', '.heif',
    '.avif', '.gif', '.bmp', '.arw', '.cr2', '.cr3', '.nef', '.nrw',
    '.dng', '.raf', '.orf', '.rw2', '.pef', '.sr2', '.srf', '.srw',
    '.kdc', '.erf', '.iiq', '.mos', '.mef', '.fff', '.3fr', '.x3f', '.rwl',
];

type CloudState = 'idle' | 'submitting' | 'accepted' | 'error';

export default function CloudPicker({ onFiles, settings, hdrMode = false }: Props) {
    const tokenClient = useRef<{ requestAccessToken: () => void } | null>(null);
    const accessToken = useRef<string>('');

    const [cloudState, setCloudState] = useState<CloudState>('idle');
    const [cloudSource, setCloudSource] = useState('');
    const [fileCount, setFileCount] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    // ── Odešli metadata na backend (server-to-server) ─────────────────────
    const sendToBackend = useCallback(async (
        source: 'dropbox' | 'google_drive',
        files: { url?: string; id?: string; name: string; mimeType?: string; bytes?: number }[],
        token?: string,
    ) => {
        setCloudState('submitting');
        setCloudSource(source === 'dropbox' ? 'Dropbox' : 'Google Drive');
        setFileCount(files.length);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const session_id = sessionStorage.getItem('fasthdr_session_id') ?? undefined;

            const body: Record<string, unknown> = {
                source,
                files,
                settings: settings ?? {},
                hdr_mode: hdrMode,
                user_id: user?.id ?? null,
                session_id: session_id ?? null,
            };
            if (token) body.access_token = token;

            const res = await fetch(`${API_URL}/api/enhance/cloud-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.status === 202) {
                const data = await res.json();

                if (!user && hdrMode && data.order_id) {
                    window.location.href = `/order/hdr_pending_${data.order_id}`;
                    return;
                }

                if (!user && !hdrMode && data.upload_batch_id) {
                    setCloudState('accepted');
                    return;
                }

                setCloudState('accepted');
            } else {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? `Chyba serveru (${res.status})`);
            }
        } catch (err) {
            console.error('[CloudPicker] Chyba:', err);
            setErrorMsg(err instanceof Error ? err.message : 'Nepodařilo se odeslat soubory');
            setCloudState('error');
        }
    }, [settings, hdrMode]);

    // ── Dropbox Chooser SDK ───────────────────────────────────────────────
    const openDropbox = useCallback(() => {
        if (!window.Dropbox) { console.error('Dropbox SDK is not loaded'); return; }
        window.Dropbox.choose({
            success: async (files) => {
                // FIX: předáváme i bytes — backend ho použije jako Content-Length
                // při streamu na S3, aby se vyhnul 400 chybě bez bufferu.
                const metadata = files.map(f => ({ url: f.link, name: f.name, bytes: f.bytes }));
                await sendToBackend('dropbox', metadata);
                document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' });
            },
            cancel: () => {
                document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' });
            },
            linkType: 'direct',
            multiselect: true,
            extensions: DROPBOX_EXTENSIONS,
        });
    }, [sendToBackend]);

    // ── Google Drive Picker ───────────────────────────────────────────────
    const showPicker = useCallback((token: string) => {
        window.gapi.load('picker', () => {
            setTimeout(() => {
                try {
                    const pickerRoot = window.gapi.picker;
                    const api = pickerRoot?.ViewId ? pickerRoot : pickerRoot?.api;
                    if (!api?.ViewId) { console.error('Google Picker API není dostupné'); return; }

                    const docsView = new api.DocsView(api.ViewId.DOCS);
                    docsView.setIncludeFolders(true);
                    docsView.setSelectFolderEnabled(true);

                    const p = new api.PickerBuilder()
                        .addView(docsView)
                        .setOAuthToken(token)
                        .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
                        .setAppId('117631966298')
                        .setOrigin(window.location.protocol + '//' + window.location.host)
                        .enableFeature(api.Feature?.MULTISELECT_ENABLED ?? 'multiselectEnabled')
                        .setCallback(async (data: any) => {
                            if (data.action !== 'picked') return;
                            const metadata = data.docs.map((doc: any) => ({
                                id: doc.id,
                                name: doc.name,
                                mimeType: doc.mimeType,
                            }));
                            await sendToBackend('google_drive', metadata, token);
                        })
                        .build();
                    p.setVisible(true);
                } catch (err) {
                    console.error('Picker error:', err);
                    setCloudState('error');
                    setErrorMsg('Nepodařilo se otevřít Google Picker');
                }
            }, 100);
        });
    }, [sendToBackend]);

    const handleGoogleDrive = useCallback(() => {
        if (accessToken.current) {
            showPicker(accessToken.current);
        } else {
            tokenClient.current?.requestAccessToken();
        }
    }, [showPicker]);

    const isbusy = cloudState === 'submitting';

    return (
        <>
            {/* Dropbox Chooser SDK */}
            <Script
                src="https://www.dropbox.com/static/api/2/dropins.js"
                id="dropboxjs"
                data-app-key={process.env.NEXT_PUBLIC_DROPBOX_APP_KEY}
                strategy="afterInteractive"
            />
            {/* Google API */}
            <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={() => {
                    tokenClient.current = window.google.accounts.oauth2.initTokenClient({
                        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
                        scope: 'https://www.googleapis.com/auth/drive.file',
                        callback: (response) => {
                            accessToken.current = response.access_token;
                            showPicker(response.access_token);
                        },
                    });
                }}
            />

            {/* Tlačítka */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', marginBottom: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>nebo importovat z</p>
                <button onClick={openDropbox} disabled={isbusy} className="btn" style={{ fontSize: 12, padding: '6px 14px', gap: 6, opacity: isbusy ? 0.5 : 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zm-6 9l-6 4 6 4 6-4-6-4z" />
                    </svg>
                    Dropbox
                </button>
                <button onClick={handleGoogleDrive} disabled={isbusy} className="btn" style={{ fontSize: 12, padding: '6px 14px', gap: 6, opacity: isbusy ? 0.5 : 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.567 9.401L4.5 2.5h7.933L16.5 9.401H8.567zM0 16.5l4.067-7.099L8.133 16.5H0zm16.5 0l-4.067-7.099 4.067-7.099L20.567 9.5 24 16.5H16.5z" />
                    </svg>
                    Google Drive
                </button>
            </div>

            {/* Odesílání na backend */}
            {cloudState === 'submitting' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem 2.5rem', width: 340, textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
                        <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            Předávám soubory serveru…
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            {fileCount} souborů z {cloudSource}
                        </p>
                    </div>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Přijato */}
            {cloudState === 'accepted' && (
                <div style={{ margin: '1rem 0', padding: '1rem 1.25rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>✓</span>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#4ade80', margin: '0 0 4px' }}>
                            {fileCount} souborů přijato ke zpracování
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            Server stahuje soubory z {cloudSource} na pozadí. Jakmile bude zpracování hotové, pošleme vám email. <strong style={{ color: 'var(--text-secondary)' }}>Můžete tuto stránku zavřít.</strong>
                        </p>
                    </div>
                </div>
            )}

            {/* Chyba */}
            {cloudState === 'error' && (
                <div style={{ margin: '1rem 0', padding: '1rem 1.25rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>✗</span>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', margin: '0 0 4px' }}>Nepodařilo se odeslat soubory</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{errorMsg}</p>
                        <button onClick={() => setCloudState('idle')} className="btn" style={{ fontSize: 12, padding: '4px 12px' }}>
                            Zkusit znovu
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}