'use client';

import { useCallback, useEffect, useRef } from 'react';
import Script from 'next/script';

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

async function urlToFile(url: string, filename: string): Promise<File> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
}

export default function CloudPicker({ onFiles }: Props) {
    const tokenClient = useRef<{ requestAccessToken: () => void } | null>(null);
    const accessToken = useRef<string>('');
    const pickerReady = useRef(false);

    const showPicker = useCallback((token: string) => {
        console.log('showPicker volán, pickerReady:', pickerReady.current);
        console.log('gapi.picker:', window.gapi?.picker);

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
                        console.log('Picker callback:', data.action);
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
            // Picker ještě není ready — načti znovu
            window.gapi.load('picker', () => {
                pickerReady.current = true;
                build();
            });
        }
    }, [onFiles]);

    const openDropbox = useCallback(() => {
        if (!window.Dropbox) {
            console.error('Dropbox SDK není načten');
            return;
        }

        window.Dropbox.choose({
            success: async (dbFiles) => {
                const files = await Promise.all(
                    dbFiles.map(f => urlToFile(f.link, f.name))
                );
                onFiles(files);
            },
            cancel: () => { },
            linkType: 'direct',
            multiselect: true,
            extensions: DROPBOX_EXTENSIONS,
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
            <Script
                id="dropboxjs"
                src="https://www.dropbox.com/static/api/2/dropins.js"
                data-app-key={process.env.NEXT_PUBLIC_DROPBOX_APP_KEY!}
                strategy="afterInteractive"
            />
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
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center', flexWrap: 'wrap' as const }}>
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