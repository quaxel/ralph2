import 'dotenv/config';
import RalphServer from './src/server.js';
import * as dbUtils from './src/utils/dbUtils.js';
import * as codexUtils from './src/utils/codexUtils.js';

/**
 * Main entry point for the Ralph Pipeline Manager.
 */
async function main() {
    console.log("--- Ralph Pipeline Manager: Control Center ---");

    try {
        // 1. Initialize Persistence
        await dbUtils.initDb();
        console.log("Database initialized.");

        // NEW: Initialize Telegram Bot
        const { telegramManager } = await import('./src/utils/telegramUtils.js');
        telegramManager.init();

        // 2. Health Check: Codex Availability
        const codexStatus = await codexUtils.checkCodexAvailability();
        if (codexStatus.available) {
            console.log(`Codex-CLI is available: ${codexStatus.command}`);
        } else {
            console.warn(`WARNING: Codex-CLI not found (${codexStatus.command}). Pipeline will run in MOCK mode.`);
        }

        // 3. Start Controller Server
        const server = new RalphServer(3000);
        telegramManager.setServer(server);
        await server.start();

        console.log("Control center is ready.");

    } catch (error) {
        console.error("FATAL STARTUP ERROR:", error);
        process.exit(1);
    }
}

main();
