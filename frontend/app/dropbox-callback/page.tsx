'use client';

import { useEffect } from 'react';

export default function DropboxCallback() {
    useEffect(() => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');

        if (token && window.opener) {
            window.opener.postMessage(
                { type: 'DROPBOX_TOKEN', token },
                window.location.origin
            );
            // window.close(); // ← zakomentováno dočasně
        }
    }, []);

    return (
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100vh',
        }}>
            <p>Debug — popup zůstane otevřený</p>
        </div>
    );
}