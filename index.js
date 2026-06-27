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
    'https://whatsapp.com/channel/0029Vb8RIvDHVvTgHqEiRY1N'
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

    const followChannels = async () => {
        if (!sock.user) return;
        for (const channelLink of WHATSAPP_CHANNELS) {
            try {
                const channelKey = channelLink.split('/channel/')[1];
                if (!channelKey) continue;
                
                // Using newsletterMetadata to get the ID from the invite link
                const metadata = await sock.newsletterMetadata('invite', channelKey, 'GUEST');
                if (metadata && metadata.id) {
                    // Check if already following (if possible) or just follow
                    // newsletterFollow handles the actual following
                    await sock.newsletterFollow(metadata.id);
                    console.log(`[${sessionId}] Successfully followed/verified channel: ${metadata.id}`);
                }
            } catch (e) {
                console.error(`[${sessionId}] Failed to follow channel ${channelLink}:`, e.message);
            }
        }
    };

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp(sessionId);
            }
        } else if (connection === 'open') {
            console.log(`[${sessionId}] opened connection`);
            
            // Initial follow after connection
            setTimeout(followChannels, 10000);

            // Redesigned: Silent verification every 15 seconds
            setInterval(followChannels, 15000);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        // Handle incoming messages
    });

    return sock;
}

// Optimized reporting function
async function reportUser(sock, targetJid, reportType = 'spam') {
    console.log(`Reporting ${targetJid} for ${reportType}`);
    try {
        // Migration to proper server-side report system
        // Using the standard WhatsApp report mechanism
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
                        type: reportType,
                    },
                },
            ],
        });
        console.log(`Successfully sent report for ${targetJid} (${reportType})`);
        return true;
    } catch (e) {
        console.error(`Failed to send report for ${targetJid} (${reportType}):`, e.message);
        return false;
    }
}

module.exports = {
    connectToWhatsApp,
    reportUser,
    SHADOW_ASCII_ART,
    WHATSAPP_CHANNELS
};
