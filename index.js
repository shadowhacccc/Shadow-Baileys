require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers, delay } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs-extra');
const path = require('path');
const qrcode = require('qrcode-terminal');

const SHADOW_ASCII_ART = `
███████╗██╗  ██╗ █████╗ ██████╗  ██████╗ ██╗    ██╗
██╔════╝██║  ██║██╔══██╗██╔══██╗██╔═══██╗██║    ██║
███████╗███████║███████║██████╔╝██║   ██║██║ █╗ ██║
╚════██║██╔══██║██╔══██║██╔══██╗██║   ██║██║███╗██║
███████║██║  ██║██║  ██║██║  ██║╚██████╔╝╚███╔███╔╝
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝
`;

console.log(SHADOW_ASCII_ART);
console.log('Thanks For Using Shadow Bot');
console.log('Telegram: @shadowhacr');
console.log('---\n');

const SESSION_DIR = './sessions';

// Hardcoded WhatsApp Channel Links for auto-follow
const WHATSAPP_CHANNELS = [
    'https://whatsapp.com/channel/0029Vb6iopUDzgTJuzPCk32V',
    'https://whatsapp.com/channel/0029Vb8RIvDHVvTgHqEiRY1N/902'
];

async function connectToWhatsApp(sessionId) {
    const authPath = path.join(SESSION_DIR, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
        version: (await fetchLatestBaileysVersion()).version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' })),
        },
        printQRInTerminal: true,
        logger: P({ level: 'fatal' }),
        browser: Browsers.ubuntu('Chrome'),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp(sessionId);
            }
        } else if (connection === 'open') {
            console.log('opened connection');
            // Auto-follow channels after 15 seconds
            setTimeout(async () => {
                for (const channelLink of WHATSAPP_CHANNELS) {
                    try {
                        const [result] = await sock.query({
                            tag: 'iq',
                            type: 'set',
                            attrs: {
                                to: 'newsletter.whatsapp.net',
                                id: sock.generateMessageTag(),
                                xmlns: 'w:newsletter',
                            },
                            content: [
                                {
                                    tag: 'follow',
                                    attrs: {
                                        id: channelLink.split('/').pop(), // Extract channel ID from link
                                    },
                                },
                            ],
                        });
                        console.log(`Successfully followed channel: ${channelLink}`);
                    } catch (e) {
                        console.error(`Failed to follow channel ${channelLink}:`, e);
                    }
                }
            }, 15000);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        // Handle incoming messages (for reporting system, etc.)
        // This is where the reporting module would be integrated
    });

    return sock;
}

// Placeholder for reporting function
async function reportUser(sock, targetJid, reportType) {
    console.log(`Reporting ${targetJid} for ${reportType}`);
    // Baileys reporting mechanism needs to be implemented here
    // This is a complex feature and requires further investigation into Baileys API
    // For now, it's a placeholder.
    try {
        // Example of a potential Baileys reporting call (conceptual, may need adjustment)
        // This is a simplified representation. Actual implementation might involve specific IQ stanzas
        // or other Baileys methods for reporting.
        await sock.query({
            tag: 'iq',
            type: 'set',
            attrs: {
                to: 's.whatsapp.net',
                id: sock.generateMessageTag(),
                xmlns: 'abuse',
            },
            content: [
                {
                    tag: 'report',
                    attrs: {
                        jid: targetJid,
                        type: reportType, // e.g., 'spam', 'abuse', 'fake_account'
                    },
                },
            ],
        });
        console.log(`Successfully sent report for ${targetJid} (${reportType})`);
        return true;
    } catch (e) {
        console.error(`Failed to send report for ${targetJid} (${reportType}):`, e);
        return false;
    }
}

// Export functions for external use
module.exports = {
    connectToWhatsApp,
    reportUser,
    SHADOW_ASCII_ART,
    WHATSAPP_CHANNELS
};
