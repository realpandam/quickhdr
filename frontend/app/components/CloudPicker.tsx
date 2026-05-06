'use client';

import Script from 'next/script';
import { useCallback, useRef, useState } from 'react';

interface Props {
    onFiles: (files: File[]) => void;
}

declare global {
    interface Window {
        Dropbox: {
            choose: (options: {
                success: (files: { link: string; name: string }[]) => void;
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
            picker: {
                api: {
                    PickerBuilder: new () => any;
                    ViewId: { DOCS: string; DOCS_IMAGES: string };
                    DocsView: new (viewId: string) => any;
                    Action: { PICKED: string };
                };
                PickerBuilder: new () => any;
                ViewId: { DOCS: string; DOCS_IMAGES: string };
                DocsView: new (viewId: string) => any;
                Action: { PICKED: string };
                Feature: { MULTISELECT_ENABLED: string };
            };
        };
    }
}

const RAW_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/tiff',
    'image/heic', 'image/heif', 'image/avif', 'image/gif', 'image/bmp',
].join(',');

const DROPBOX_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic', '.heif',
    '.avif', '.gif', '.bmp', '.arw', '.cr2', '.cr3', '.nef', '.nrw',
    '.dng', '.raf', '.orf', '.rw2', '.pef', '.sr2', '.srf', '.srw',
];

export default function CloudPicker({ onFiles }: Props) {
    const [dropboxToken, setDropboxToken] = useState<string>('');
    const [dropboxPath, setDropboxPath] = useState<string>('');
    const [dropboxEntries, setDropboxEntries] = useState<any[]>([]);
    const [dropboxLoading, setDropboxLoading] = useState(false);
    const [showDropboxBrowser, setShowDropboxBrowser] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<any[]>([]);

    const tokenClient = useRef<{ requestAccessToken: () => void } | null>(null);
    const accessToken = useRef<string>('');
    const pickerReady = useRef(false);
    const dropboxPopup = useRef<Window | null>(null);

    // ── Google Drive picker ────────────────────────────────────────────────
    const showPicker = useCallback((token: string) => {
        const build = () => {
            try {
                const picker = window.gapi.picker;
                const api = (picker as any).api ?? picker;

                const docsView = new api.DocsView(api.ViewId.DOCS);
                docsView.setMimeTypes(RAW_MIME_TYPES);

                const p = new api.PickerBuilder()
                    .addView(docsView)
                    .setOAuthToken(token)
                    .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
                    .setAppId('117631966298')
                    .setOrigin(window.location.protocol + '//' + window.location.host)
                    .enableFeature(api.Feature?.MULTISELECT_ENABLED ?? 'multiselectEnabled')
                    .setCallback((data: any) => {
                        if (data.action !== 'picked') return;
                        Promise.all(
                            data.docs.map(async (doc: any) => {
                                const res = await fetch(
                                    `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
                                    { headers: { Authorization: `Bearer ${token}` } }
                                );
                                const blob = await res.blob();
                                return new File([blob], doc.name, { type: doc.mimeType });
                            })
                        ).then(onFiles);
                    })
                    .build();

                p.setVisible(true);
            } catch (err) {
                console.error('Picker error:', err);
            }
        };

        if (pickerReady.current) {
            build();
        } else {
            window.gapi.load('picker', () => {
                pickerReady.current = true;
                build();
            });
        }
    }, [onFiles]);

    // ── Dropbox — načtení složky ───────────────────────────────────────────
    const loadDropboxFolder = useCallback(async (token: string, path: string) => {
        setDropboxLoading(true);
        const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path,
                recursive: false,
                include_media_info: true,
            }),
        });
        const data = await res.json();
        setDropboxEntries(data.entries ?? []);
        setDropboxLoading(false);
    }, []);

    // ── Dropbox — OAuth popup ──────────────────────────────────────────────
    const openDropbox = useCallback(() => {
        const appKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
        if (!appKey) {
            console.error('Dropbox App Key není nastaven');
            return;
        }

        const cachedToken = sessionStorage.getItem('dropbox_token');
        if (cachedToken) {
            setDropboxToken(cachedToken);
            setDropboxPath('');
            setSelectedFiles([]);
            setShowDropboxBrowser(true);
            loadDropboxFolder(cachedToken, '');
            return;
        }

        const redirectUri = `${window.location.origin}/dropbox-callback.html`;
        const authUrl =
            `https://www.dropbox.com/oauth2/authorize?` +
            `client_id=${appKey}` +
            `&response_type=token` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}`;

        const width = 800, height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        dropboxPopup.current = window.open(
            authUrl,
            'dropbox-auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );

        const handler = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'DROPBOX_TOKEN') return;

            window.removeEventListener('message', handler);

            const token = event.data.token;
            sessionStorage.setItem('dropbox_token', token);
            setDropboxToken(token);
            setDropboxPath('');
            setSelectedFiles([]);
            setShowDropboxBrowser(true);
            await loadDropboxFolder(token, '');
        };

        window.addEventListener('message', handler);
    }, [loadDropboxFolder]);

    // ── Dropbox — stažení vybraných souborů ───────────────────────────────
    const importSelectedFiles = useCallback(async () => {
        setShowDropboxBrowser(false);
        const files = await Promise.all(
            selectedFiles.map(async (entry) => {
                const res = await fetch('https://content.dropboxapi.com/2/files/download', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${dropboxToken}`,
                        'Dropbox-API-Arg': JSON.stringify({ path: entry.path_lower }),
                    },
                });
                const blob = await res.blob();
                return new File([blob], entry.name, { type: blob.type });
            })
        );
        setSelectedFiles([]);
        onFiles(files);
    }, [selectedFiles, dropboxToken, onFiles]);

    const handleGoogleDrive = useCallback(() => {
        if (accessToken.current) {
            showPicker(accessToken.current);
        } else {
            tokenClient.current?.requestAccessToken();
        }
    }, [showPicker]);

    return (
        <>
            <Script
                src="https://apis.google.com/js/api.js"
                strategy="afterInteractive"
                onLoad={() => {
                    window.gapi.load('picker', () => {
                        pickerReady.current = true;
                    });
                }}
            />
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={() => {
                    tokenClient.current = window.google.accounts.oauth2.initTokenClient({
                        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
                        scope: 'https://www.googleapis.com/auth/drive.readonly',
                        callback: (response) => {
                            accessToken.current = response.access_token;
                            showPicker(response.access_token);
                        },
                    });
                }}
            />

            {/* Tlačítka */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                    nebo importovat z
                </p>
                <button onClick={openDropbox} className="btn" style={{ fontSize: 12, padding: '6px 14px', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zm-6 9l-6 4 6 4 6-4-6-4z" />
                    </svg>
                    Dropbox
                </button>
                <button onClick={handleGoogleDrive} className="btn" style={{ fontSize: 12, padding: '6px 14px', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.567 9.401L4.5 2.5h7.933L16.5 9.401H8.567zM0 16.5l4.067-7.099L8.133 16.5H0zm16.5 0l-4.067-7.099 4.067-7.099L20.567 9.5 24 16.5H16.5z" />
                    </svg>
                    Google Drive
                </button>
            </div>

            {/* Dropbox file browser */}
            {showDropboxBrowser && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--bg-card)',
                        borderRadius: 12,
                        width: 560,
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <div>
                                <strong>Dropbox</strong>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                                    /{dropboxPath || ''}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {dropboxPath && (
                                    <button
                                        className="btn"
                                        style={{ fontSize: 12 }}
                                        onClick={() => {
                                            const parts = dropboxPath.split('/').filter(Boolean);
                                            parts.pop();
                                            const parent = parts.join('/');
                                            setDropboxPath(parent);
                                            loadDropboxFolder(dropboxToken, parent ? `/${parent}` : '');
                                        }}
                                    >
                                        ← Zpět
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowDropboxBrowser(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Seznam souborů */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem' }}>
                            {dropboxLoading ? (
                                <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    Načítám...
                                </p>
                            ) : dropboxEntries.length === 0 ? (
                                <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    Prázdná složka
                                </p>
                            ) : dropboxEntries.map((entry) => {
                                const isFolder = entry['.tag'] === 'folder';
                                const isImage = !isFolder && DROPBOX_EXTENSIONS.some(
                                    ext => entry.name.toLowerCase().endsWith(ext)
                                );
                                const isSelected = selectedFiles.some(f => f.id === entry.id);

                                if (!isFolder && !isImage) return null;

                                return (
                                    <div
                                        key={entry.id}
                                        onClick={() => {
                                            if (isFolder) {
                                                const newPath = entry.path_display.substring(1);
                                                setDropboxPath(newPath);
                                                loadDropboxFolder(dropboxToken, entry.path_lower);
                                            } else {
                                                setSelectedFiles(prev =>
                                                    isSelected
                                                        ? prev.filter(f => f.id !== entry.id)
                                                        : [...prev, entry]
                                                );
                                            }
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '0.6rem 0.75rem',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            background: isSelected
                                                ? 'rgba(99,102,241,0.1)'
                                                : 'transparent',
                                        }}
                                    >
                                        <span style={{ fontSize: 18 }}>{isFolder ? '📁' : '🖼️'}</span>
                                        <span style={{ fontSize: 14, flex: 1 }}>{entry.name}</span>
                                        {isSelected && (
                                            <span style={{ color: 'var(--accent)' }}>✓</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {selectedFiles.length > 0
                                    ? `${selectedFiles.length} souborů vybráno`
                                    : 'Vyberte soubory'}
                            </span>
                            <button
                                className="btn"
                                disabled={selectedFiles.length === 0}
                                onClick={importSelectedFiles}
                            >
                                Importovat ({selectedFiles.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}