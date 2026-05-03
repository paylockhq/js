/**
 * Paylock Injectables Receiver (Vanilla Node.js, ESM)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const LOG_FILE = path.join(__dirname, 'paylock_injectables_js.log');


const server = http.createServer((req, res) => {

    // --- CORS (dev) ---
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:63342');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }


    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: 'error',
            message: 'Method Not Allowed. Use POST.'
        }));
    }

    let rawBody = '';

    req.on('data', chunk => {
        rawBody += chunk;
        // Safety: prevent huge payload abuse
        if (rawBody.length > 10 * 1024 * 1024) { // 10MB
            req.destroy();
        }
    });

    req.on('end', () => {
        if (!rawBody.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Empty request body.'
            }));
        }

        let data;
        try {
            data = JSON.parse(rawBody);
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Invalid JSON payload.'
            }));
        }

        const entry = {
            ts: new Date().toISOString(),
            ip: req.socket.remoteAddress,
            ua: req.headers['user-agent'] || null,
            content_type: req.headers['content-type'] || null,
            payload: data
        };

        try {
            fs.appendFileSync(
                LOG_FILE,
                JSON.stringify(entry) + '\n',
                { encoding: 'utf8' }
            );
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: 'error',
                message: 'Failed to write log file.'
            }));
        }

        const injectablesCount = Array.isArray(data.injectables)
            ? data.injectables.length
            : 0;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'success',
            message: 'Injectables received and logged.',
            data: {
                injectables_count: injectablesCount
            }
        }));
    });
});

server.listen(PORT, () => {
    console.log(`[Paylock SDK] Injectables receiver running on http://localhost:${PORT}`);
});
