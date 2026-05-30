const makeWASocket = require('jagproject').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('jagproject');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// =========================================
// ⚙️ SETTINGAN DISINI (GANTI NOMOR LU)
// =========================================
const PHONE_NUMBER = "6282234856655"; // GANTI NOMOR BOT LU DISINI
const AUTO_VIEW_STATUS = true;       // true = nyala, false = mati
const MODE_KONEKSI = "pairing";      // "pairing" atau "qr"
// =========================================

const sessionDir = path.join(process.cwd(), 'sessions_jag');
const logger = pino({ level: "silent" });

console.log("🚀 XenoviaAI - Single File Mode (Jagproject)");
console.log(`👤 Owner: Feii | 👀 Auto View: ${AUTO_VIEW_STATUS ? 'ON' : 'OFF'}\n`);

async function connectToWhatsApp() {
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ["Mac OS", "Chrome", "120.0.6099.109"],
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    global.sock = sock;

    // Logic Pairing Code
    if (!state.creds.registered && MODE_KONEKSI === "pairing") {
        console.log("⏳ Menyiapkan Pairing Code...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
            const code = await sock.requestPairingCode(PHONE_NUMBER.replace(/[^0-9]/g, ''));
            console.log('\n========================================');
            console.log('📱 NOMOR:', PHONE_NUMBER);            console.log('🔑 CODE:', code);
            console.log('========================================\n');
            console.log("👉 Masukkan kode ini di HP WhatsApp lu!\n");
        } catch (err) {
            console.log("❌ Gagal Pairing:", err.message);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // EVENT: PESAN MASUK
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (let msg of messages) {
            if (msg.key.remoteJid === 'status@broadcast') {
                if (!AUTO_VIEW_STATUS) continue;

                let participant = msg.key.participant || msg.key.participantAlt || msg.participant;
                
                if (!participant) {
                    console.log("⚠️ Skip: No participant found");
                    continue;
                }

                const senderName = msg.pushName || participant.split('@')[0];
                console.log(`👀 [AUTO VIEW] Target: ${senderName}`);
                console.log(`   ID: ${participant}`);

                try {
                    // DELAY MANUSIA (15-30 DETIK)
                    const watchTime = Math.floor(Math.random() * 9000) + 1000;
                    console.log(`⏱️ Watching for ${watchTime/1000}s...`);
                    await new Promise(r => setTimeout(r, watchTime));

                    // KIRIM READ RECEIPT
                    console.log("✅ Sending Read Receipt...");
                    
                    await sock.readMessages([{
                        remoteJid: 'status@broadcast',
                        id: msg.key.id,
                        participant: participant,
                        fromMe: false
                    }]);
                    
                    console.log(`🎉 [SUCCESS] Status ${senderName} PROCESSED!\n`);

                } catch (err) {
                    console.log(`💥 [ERROR] ${err.message}\n`);
                }
                continue;
            }            
            // Log Chat Biasa
            if (!msg.fromMe && msg.message) {
                const waktu = new Date().toLocaleTimeString('id-ID');
                const nama = msg.pushName || 'Anonim';
                const isi = msg.message.conversation || msg.message.extendedTextMessage?.text || '(Media)';
                console.log(`[${waktu}] ${nama}: ${isi.slice(0,40)}...`);
            }
        }
    });

    // EVENT: KONEKSI
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if (qr && MODE_KONEKSI === "qr") {
            console.log("\n📲 Scan QR Code:\n");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            console.log("\n✅ XENOVIA AI ONLINE & READY!\n");
        }
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log("📵 Logout. Hapus folder sessions_jag & run ulang.");
                process.exit(0);
            }
            console.log(`⚠️ Putus (${reason}). Reconnecting...`);
            setTimeout(connectToWhatsApp, 3000);
        }
    });

    return sock;
}

connectToWhatsApp().catch(err => {
    console.error("💥 Fatal Error:", err);
    process.exit(1);
});
