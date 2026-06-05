'use client';

import Script from 'next/script';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface DropboxEntry {
    tag: 'file' | 'folder';
    id: string;
    name: string;
    path_lower: string;
    size?: number;
    modified?: string;
    sharing_info?: { parent_shared_folder_id?: string } | null;
}

type CloudState = 'idle' | 'submitting' | 'accepted' | 'error';
type DropboxAuthState = 'idle' | 'authenticating' | 'browsing';
type SortField = 'name' | 'size' | 'modified';
type SortDir = 'asc' | 'desc';

const SUPPORTED_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'gif',
    'arw', 'sr2', 'srf', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'raf', 'orf', 'rw2', 'pef',
    'kdc', 'erf', 'dng', 'iiq', 'mos', 'mef', 'fff', '3fr', 'x3f', 'rwl', 'srw',
]);

function isSupportedFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return SUPPORTED_EXTENSIONS.has(ext);
}

function formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function CloudPicker({ onFiles, settings, hdrMode = false }: Props) {
    const tokenClient = useRef<{ requestAccessToken: () => void } | null>(null);
    const accessToken = useRef<string>('');

    const [cloudState, setCloudState] = useState<CloudState>('idle');
    const [cloudSource, setCloudSource] = useState('');
    const [fileCount, setFileCount] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const [dropboxAuthState, setDropboxAuthState] = useState<DropboxAuthState>('idle');
    const [dropboxToken, setDropboxToken] = useState<string>('');
    const [dropboxRefreshToken, setDropboxRefreshToken] = useState<string>('');
    const [dropboxEntries, setDropboxEntries] = useState<DropboxEntry[]>([]);
    const [dropboxPath, setDropboxPath] = useState<string>('');
    const [dropboxPathHistory, setDropboxPathHistory] = useState<string[]>([]);
    const [dropboxLoading, setDropboxLoading] = useState(false);
    const [dropboxSelected, setDropboxSelected] = useState<Set<string>>(new Set());
    const [dropboxError, setDropboxError] = useState('');
    const dropboxCsrfState = useRef<string>('');

    // Nové stavy pro search, sort, filter
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [showOnlyImages, setShowOnlyImages] = useState(false);

    const openDropboxOAuth = useCallback(async () => {
        try {
            setDropboxAuthState('authenticating');
            setDropboxError('');

            const res = await fetch(`${API_URL}/api/enhance/dropbox-auth-url`);
            if (!res.ok) throw new Error('Nepodařilo se získat Dropbox auth URL');
            const { url, state } = await res.json();

            dropboxCsrfState.current = state;
            sessionStorage.setItem('dropbox_oauth_state', state);

            const popup = window.open(url, 'dropbox-oauth', 'width=600,height=700,scrollbars=yes,resizable=yes');

            if (!popup) {
                throw new Error('Popup byl zablokován. Povolte popupy pro fasthdr.cz a zkuste znovu.');
            }

            const handleMessage = async (event: MessageEvent) => {
                if (event.origin !== window.location.origin) return;
                if (event.data?.type !== 'dropbox_oauth_callback') return;

                window.removeEventListener('message', handleMessage);
                popup.close();

                const { code, state: returnedState, error: oauthError } = event.data;

                if (oauthError) {
                    setDropboxAuthState('idle');
                    setDropboxError(`Dropbox odmítl přihlášení: ${oauthError}`);
                    return;
                }

                const savedState = sessionStorage.getItem('dropbox_oauth_state');
                if (returnedState !== savedState) {
                    setDropboxAuthState('idle');
                    setDropboxError('Bezpečnostní chyba (state mismatch). Zkuste znovu.');
                    return;
                }

                try {
                    const tokenRes = await fetch(`${API_URL}/api/enhance/dropbox-token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                    });

                    if (!tokenRes.ok) throw new Error('Nepodařilo se získat Dropbox token');
                    const { access_token, refresh_token } = await tokenRes.json();

                    setDropboxToken(access_token);
                    setDropboxRefreshToken(refresh_token ?? '');
                    setDropboxAuthState('browsing');
                    setSearchQuery('');
                    await loadDropboxFolder('', access_token);
                } catch (err) {
                    setDropboxAuthState('idle');
                    setDropboxError(err instanceof Error ? err.message : 'Chyba při přihlašování k Dropboxu');
                }
            };

            window.addEventListener('message', handleMessage);

            const pollClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(pollClosed);
                    window.removeEventListener('message', handleMessage);
                    setDropboxAuthState(prev => prev === 'authenticating' ? 'idle' : prev);
                }
            }, 500);

        } catch (err) {
            setDropboxAuthState('idle');
            setDropboxError(err instanceof Error ? err.message : 'Nepodařilo se spustit Dropbox přihlášení');
        }
    }, []);

    const loadDropboxFolder = useCallback(async (folderPath: string, token?: string) => {
        const usedToken = token ?? dropboxToken;
        if (!usedToken) return;

        setDropboxLoading(true);
        setDropboxError('');
        setSearchQuery('');

        try {
            const res = await fetch(`${API_URL}/api/enhance/dropbox-list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: usedToken, path: folderPath }),
            });

            if (!res.ok) throw new Error('Nepodařilo se načíst složku');
            const data = await res.json();
            setDropboxEntries(data.entries as DropboxEntry[]);
            setDropboxPath(folderPath);
        } catch (err) {
            setDropboxError(err instanceof Error ? err.message : 'Chyba při načítání složky');
        } finally {
            setDropboxLoading(false);
        }
    }, [dropboxToken]);

    // Filtrované + seřazené entries
    const filteredEntries = useMemo(() => {
        let entries = [...dropboxEntries];

        // Filtr: pouze obrázky
        if (showOnlyImages) {
            entries = entries.filter(e => e.tag === 'folder' || isSupportedFile(e.name));
        }

        // Hledání
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            entries = entries.filter(e => e.name.toLowerCase().includes(q));
        }

        // Složky vždy nahoře, pak soubory
        entries.sort((a, b) => {
            if (a.tag !== b.tag) return a.tag === 'folder' ? -1 : 1;
            let cmp = 0;
            if (sortField === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortField === 'size') cmp = (a.size ?? 0) - (b.size ?? 0);
            else if (sortField === 'modified') cmp = (a.modified ?? '').localeCompare(b.modified ?? '');
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return entries;
    }, [dropboxEntries, searchQuery, sortField, sortDir, showOnlyImages]);

    const handleSort = useCallback((field: SortField) => {
        setSortField(prev => {
            if (prev === field) {
                setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return field;
            }
            setSortDir('asc');
            return field;
        });
    }, []);

    const navigateInto = useCallback((entry: DropboxEntry) => {
        if (entry.tag !== 'folder') return;
        setDropboxPathHistory(h => [...h, dropboxPath]);
        setDropboxSelected(new Set());
        loadDropboxFolder(entry.path_lower);
    }, [dropboxPath, loadDropboxFolder]);

    const navigateBack = useCallback(() => {
        const history = [...dropboxPathHistory];
        const prev = history.pop() ?? '';
        setDropboxPathHistory(history);
        setDropboxSelected(new Set());
        loadDropboxFolder(prev);
    }, [dropboxPathHistory, loadDropboxFolder]);

    const toggleSelect = useCallback((entry: DropboxEntry) => {
        if (entry.tag !== 'file' || !isSupportedFile(entry.name)) return;
        setDropboxSelected(prev => {
            const next = new Set(prev);
            if (next.has(entry.id)) next.delete(entry.id);
            else next.add(entry.id);
            return next;
        });
    }, []);

    const supportedFilesInView = useMemo(
        () => filteredEntries.filter(e => e.tag === 'file' && isSupportedFile(e.name)),
        [filteredEntries]
    );

    const allViewSelected = supportedFilesInView.length > 0 && supportedFilesInView.every(e => dropboxSelected.has(e.id));

    const selectAllInView = useCallback(() => {
        if (allViewSelected) {
            setDropboxSelected(prev => {
                const next = new Set(prev);
                supportedFilesInView.forEach(e => next.delete(e.id));
                return next;
            });
        } else {
            setDropboxSelected(prev => {
                const next = new Set(prev);
                supportedFilesInView.forEach(e => next.add(e.id));
                return next;
            });
        }
    }, [supportedFilesInView, allViewSelected]);

    const confirmDropboxSelection = useCallback(async () => {
        // Vybereme ze všech entries (ne jen filtrovaných) podle selected IDs
        const selectedEntries = dropboxEntries.filter(e => dropboxSelected.has(e.id));
        if (selectedEntries.length === 0) { setDropboxError('Nevybrali jste žádné soubory.'); return; }

        setDropboxAuthState('idle');

        const files = selectedEntries.map(e => ({
            id: e.id,
            name: e.name,
            path_lower: e.path_lower,
            size: e.size,
            sharing_info: e.sharing_info ?? null,
        }));

        await sendToBackend('dropbox_oauth', files, dropboxToken, dropboxRefreshToken);
    }, [dropboxEntries, dropboxSelected, dropboxToken, dropboxRefreshToken]);

    const sendToBackend = useCallback(async (
        source: 'dropbox_oauth' | 'google_drive',
        files: { url?: string; id?: string; path_lower?: string; name: string; mimeType?: string; bytes?: number; size?: number; sharing_info?: { parent_shared_folder_id?: string } | null }[],
        token?: string,
        refreshToken?: string,
    ) => {
        setCloudState('submitting');
        setCloudSource(source === 'dropbox_oauth' ? 'Dropbox' : 'Google Drive');
        setFileCount(files.length);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const session_id = sessionStorage.getItem('fasthdr_session_id') ?? undefined;

            const body: Record<string, unknown> = {
                source, files, settings: settings ?? {}, hdr_mode: hdrMode,
                user_id: user?.id ?? null, session_id: session_id ?? null,
            };
            if (token) body.access_token = token;
            if (refreshToken) body.refresh_token = refreshToken;

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

                if (!user && data.upload_batch_id) {
                    window.location.href = `/processing/${data.upload_batch_id}?count=${files.length}&source=${source}`;
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
                                id: doc.id, name: doc.name, mimeType: doc.mimeType,
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
        if (accessToken.current) showPicker(accessToken.current);
        else tokenClient.current?.requestAccessToken();
    }, [showPicker]);

    const isbusy = cloudState === 'submitting';
    const currentFolderName = dropboxPath ? dropboxPath.split('/').filter(Boolean).pop() ?? 'Dropbox' : 'Dropbox';

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>↕</span>;
        return <span style={{ color: 'var(--accent)', fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <>
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

            {/* Tlačítka importu */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', marginBottom: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>nebo importovat z</p>
                <button
                    onClick={openDropboxOAuth}
                    disabled={isbusy || dropboxAuthState === 'authenticating'}
                    className="btn"
                    style={{ fontSize: 12, padding: '6px 14px', gap: 6, opacity: (isbusy || dropboxAuthState === 'authenticating') ? 0.5 : 1 }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zm-6 9l-6 4 6 4 6-4-6-4z" />
                    </svg>
                    {dropboxAuthState === 'authenticating' ? 'Přihlašuji…' : 'Dropbox'}
                </button>
                <button
                    onClick={handleGoogleDrive}
                    disabled={isbusy}
                    className="btn"
                    style={{ fontSize: 12, padding: '6px 14px', gap: 6, opacity: isbusy ? 0.5 : 1 }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.567 9.401L4.5 2.5h7.933L16.5 9.401H8.567zM0 16.5l4.067-7.099L8.133 16.5H0zm16.5 0l-4.067-7.099 4.067-7.099L20.567 9.5 24 16.5H16.5z" />
                    </svg>
                    Google Drive
                </button>
            </div>

            {/* Dropbox file browser modal */}
            {mounted && dropboxAuthState === 'browsing' && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000000e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: 'min(680px, calc(100vh - 3rem))', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.8)', overflow: 'hidden' }}>

                        {/* Header */}
                        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            {dropboxPathHistory.length > 0 && (
                                <button onClick={navigateBack} title="Zpět" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                                </button>
                            )}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0061FF" style={{ flexShrink: 0 }}>
                                <path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4L6 2zm12 0l-6 4 6 4-6 4 6 4 6-4-6-4 6-4-6-4zm-6 9l-6 4 6 4 6-4-6-4z" />
                            </svg>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {currentFolderName}
                            </span>
                            <button onClick={() => { setDropboxAuthState('idle'); setDropboxSelected(new Set()); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, flexShrink: 0 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Search + filtry */}
                        <div style={{ padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'rgba(255,255,255,0.02)' }}>
                            {/* Search */}
                            <div style={{ flex: 1, position: 'relative' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Hledat soubory…"
                                    style={{ width: '100%', paddingLeft: 30, paddingRight: searchQuery ? 28 : 10, paddingTop: 6, paddingBottom: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>

                            {/* Filtr: jen obrázky */}
                            <button
                                onClick={() => setShowOnlyImages(v => !v)}
                                title={showOnlyImages ? 'Zobrazit vše' : 'Jen podporované formáty'}
                                style={{ background: showOnlyImages ? 'rgba(123,92,240,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showOnlyImages ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 7, padding: '5px 10px', fontSize: 11, color: showOnlyImages ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: showOnlyImages ? 600 : 400 }}
                            >
                                📷 Jen foto
                            </button>
                        </div>

                        {/* Toolbar: select all + sort */}
                        <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {/* Select all */}
                            <button
                                onClick={selectAllInView}
                                disabled={supportedFilesInView.length === 0}
                                style={{ background: 'none', border: 'none', cursor: supportedFilesInView.length === 0 ? 'default' : 'pointer', fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 500, opacity: supportedFilesInView.length === 0 ? 0.4 : 1 }}
                            >
                                {allViewSelected ? 'Odznačit vše' : `Vybrat vše${searchQuery ? ' (výsledky)' : ''} (${supportedFilesInView.length})`}
                            </button>

                            <span style={{ flex: 1 }} />

                            {/* Počet vybraných */}
                            {dropboxSelected.size > 0 && (
                                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                                    {dropboxSelected.size} vybráno
                                </span>
                            )}

                            {/* Sort buttons */}
                            <div style={{ display: 'flex', gap: 2 }}>
                                {(['name', 'size', 'modified'] as SortField[]).map(f => (
                                    <button key={f} onClick={() => handleSort(f)}
                                        style={{ background: sortField === f ? 'rgba(123,92,240,0.15)' : 'none', border: `1px solid ${sortField === f ? 'rgba(123,92,240,0.4)' : 'transparent'}`, borderRadius: 5, padding: '3px 8px', fontSize: 11, color: sortField === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        {{ name: 'Název', size: 'Vel.', modified: 'Datum' }[f]} <SortIcon field={f} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Obsah složky */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
                            {dropboxLoading ? (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>
                                    <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', margin: '0 auto 0.75rem', animation: 'spin 1s linear infinite' }} />
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Načítám…</p>
                                </div>
                            ) : dropboxError ? (
                                <div style={{ padding: '1rem 1.25rem' }}><p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{dropboxError}</p></div>
                            ) : filteredEntries.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                        {searchQuery ? 'Žádné výsledky pro „' + searchQuery + '"' : 'Složka je prázdná'}
                                    </p>
                                </div>
                            ) : filteredEntries.map(entry => {
                                const isFolder = entry.tag === 'folder';
                                const isSupported = !isFolder && isSupportedFile(entry.name);
                                const isSelected = dropboxSelected.has(entry.id);
                                const isUnsupported = !isFolder && !isSupported;
                                return (
                                    <div key={entry.id}
                                        onClick={() => isFolder ? navigateInto(entry) : toggleSelect(entry)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.45rem 1.25rem', cursor: isUnsupported ? 'default' : 'pointer', opacity: isUnsupported ? 0.3 : 1, background: isSelected ? 'rgba(123,92,240,0.12)' : 'transparent', transition: 'background 0.1s' }}
                                        onMouseEnter={e => { if (!isUnsupported && !isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
                                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                                    >
                                        {/* Checkbox pro soubory */}
                                        {!isFolder && (
                                            <div style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, border: isSelected ? '2px solid var(--accent)' : '2px solid var(--border)', background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                                                {isSelected && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                            </div>
                                        )}
                                        {/* Ikona */}
                                        {isFolder ? (
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="#FACC15" style={{ flexShrink: 0 }}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
                                        ) : (
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0, color: isSupported ? 'var(--text-secondary)' : 'var(--text-muted)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><polyline points="14 2 14 8 20 8" /></svg>
                                        )}
                                        {/* Název + meta */}
                                        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                                            <p style={{ fontSize: 13, margin: 0, fontWeight: isFolder ? 500 : 400, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</p>
                                        </div>
                                        {/* Meta: velikost + datum */}
                                        {!isFolder && (
                                            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
                                                {entry.size && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatSize(entry.size)}</span>}
                                                {entry.modified && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(entry.modified)}</span>}
                                            </div>
                                        )}
                                        {isFolder && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {dropboxSelected.size > 0 ? `${dropboxSelected.size} souborů vybráno` : 'Vyberte soubory'}
                            </span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {dropboxSelected.size > 0 && (
                                    <button onClick={() => setDropboxSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '6px 10px' }}>
                                        Zrušit výběr
                                    </button>
                                )}
                                <button onClick={confirmDropboxSelection} disabled={dropboxSelected.size === 0} className="btn"
                                    style={{ fontSize: 13, padding: '8px 20px', opacity: dropboxSelected.size === 0 ? 0.4 : 1, background: 'var(--accent)' }}>
                                    Importovat ({dropboxSelected.size})
                                </button>
                            </div>
                        </div>
                    </div>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>,
                document.body
            )}

            {/* Odesílání na backend */}
            {mounted && cloudState === 'submitting' && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000000e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem 2.5rem', width: 340, textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
                        <div style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Předávám soubory serveru…</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fileCount} souborů z {cloudSource}</p>
                    </div>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>,
                document.body
            )}

            {/* Přijato */}
            {cloudState === 'accepted' && (
                <div style={{ margin: '1rem 0', padding: '1rem 1.25rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>✓</span>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#4ade80', margin: '0 0 4px' }}>{fileCount} souborů přijato ke zpracování</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                            Server zpracovává fotografie na pozadí. Po dokončení vám pošleme email a výsledky najdete v <a href="/dashboard" style={{ color: 'var(--accent)' }}>Moje fotografie</a>.
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
                        <button onClick={() => setCloudState('idle')} className="btn" style={{ fontSize: 12, padding: '4px 12px' }}>Zkusit znovu</button>
                    </div>
                </div>
            )}

            {/* Dropbox chyba */}
            {dropboxError && dropboxAuthState === 'idle' && cloudState === 'idle' && (
                <div style={{ margin: '0.5rem 0', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8 }}>
                    <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{dropboxError}</p>
                </div>
            )}
        </>
    );
}