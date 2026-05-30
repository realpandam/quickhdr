'use client';

import Script from 'next/script';
import { useCallback, useRef } from 'react';

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

const BATCH_SIZE = 5;

export default function CloudPicker({ onFiles }: Props) {
    const tokenClient = useRef<{ requestAccessToken: () => void } | null>(null);
    const accessToken = useRef<string>('');

    // ── Dropbox Chooser SDK ───────────────────────────────────────────────
    const openDropbox = useCallback(() => {
        if (!window.Dropbox) {
            console.error('Dropbox SDK is not loaded');
            return;
        }

        window.Dropbox.choose({
            success: async (files) => {
                // Stahuj po dávkách — zabrání pádu při 100+ souborech
                const result: File[] = [];
                for (let i = 0; i < files.length; i += BATCH_SIZE) {
                    const batch = files.slice(i, i + BATCH_SIZE);
                    const batchFiles = await Promise.all(
                        batch.map(async (f) => {
                            const url = f.link.replace('dl=0', 'dl=1');
                            const res = await fetch(url);
                            const blob = await res.blob();
                            return new File([blob], f.name, { type: blob.type });
                        })
                    );
                    result.push(...batchFiles);
                }
                onFiles(result);
                document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' });
            },
            cancel: () => {
                document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' });
            },
            linkType: 'direct',
            multiselect: true,
            extensions: DROPBOX_EXTENSIONS,
        });
    }, [onFiles]);

    // ── Google Drive Picker ───────────────────────────────────────────────
    const showPicker = useCallback((token: string) => {
        window.gapi.load('picker', () => {
            setTimeout(() => {
                try {
                    const pickerRoot = window.gapi.picker;
                    const api = pickerRoot?.ViewId ? pickerRoot : pickerRoot?.api;

                    if (!api?.ViewId) {
                        console.error('Google Picker API není dostupné', pickerRoot);
                        return;
                    }

                    const docsView = new api.DocsView(api.ViewId.DOCS);

                    const p = new api.PickerBuilder()
                        .addView(docsView)
                        .setOAuthToken(token)
                        .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
                        .setAppId('117631966298')
                        .setOrigin(window.location.protocol + '//' + window.location.host)
                        .enableFeature(api.Feature?.MULTISELECT_ENABLED ?? 'multiselectEnabled')
                        .setCallback(async (data: any) => {
                            if (data.action !== 'picked') return;
                            // Stahuj po dávkách — zabrání pádu při 100+ souborech
                            const result: File[] = [];
                            for (let i = 0; i < data.docs.length; i += BATCH_SIZE) {
                                const batch = data.docs.slice(i, i + BATCH_SIZE);
                                const batchFiles = await Promise.all(
                                    batch.map(async (doc: any) => {
                                        const res = await fetch(
                                            `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
                                            { headers: { Authorization: `Bearer ${token}` } }
                                        );
                                        const blob = await res.blob();
                                        return new File([blob], doc.name, { type: doc.mimeType });
                                    })
                                );
                                result.push(...batchFiles);
                            }
                            onFiles(result);
                        })
                        .build();

                    p.setVisible(true);
                } catch (err) {
                    console.error('Picker error:', err);
                }
            }, 100);
        });
    }, [onFiles]);

    const handleGoogleDrive = useCallback(() => {
        if (accessToken.current) {
            showPicker(accessToken.current);
        } else {
            tokenClient.current?.requestAccessToken();
        }
    }, [showPicker]);

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
            <Script
                src="https://apis.google.com/js/api.js"
                strategy="afterInteractive"
            />
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
        </>
    );
}