import { spawn } from 'child_process';
import 'dotenv/config';
import fs from 'fs';

/**
 * Executes a prompt via codex-cli in non-interactive mode.
 * @param {string} prompt - The prompt to send to the AI.
 * @param {string} workingDir - The directory where the command should be executed.
 * @returns {Promise<string>} - The stdout from the AI tool.
 */
export async function runCodex(prompt, workingDir) {
    const codexCmd = process.env.CODEX_COMMAND || 'codex';

    // Safety check for CWD
    const finalCwd = fs.existsSync(workingDir) ? workingDir : process.cwd();

    return new Promise((resolve) => {
        // Prepare args for non-interactive execution
        const args = [
            'exec',
            '--dangerously-bypass-approvals-and-sandbox',
            '--skip-git-repo-check',
            '--color', 'never'
        ];

        console.log(`[Codex] Starting: ${codexCmd} ${args.join(' ')}`);
        console.log(`[Codex] Prompt length: ${prompt.length} chars (High Reasoning active)`);

        // We use spawn without shell: true to avoid security warnings and potential shell-related hangs
        // We assume codexCmd is just the binary name/path. 
        // If it's something like 'npx codex-cli', it might need special handling.
        let cmd = codexCmd;
        let finalArgs = [...args];

        if (codexCmd.startsWith('npx ')) {
            cmd = 'npx';
            finalArgs = [codexCmd.split(' ')[1], ...args];
        }

        const child = spawn(cmd, finalArgs, {
            cwd: finalCwd,
            env: { ...process.env, FORCE_COLOR: '0', CI: 'true' }
        });

        let stdout = '';
        let stderr = '';

        // Handle large stdin correctly
        child.stdin.on('error', (err) => {
            console.error('[Codex] Stdin Error:', err);
        });

        child.stdin.write(prompt);
        child.stdin.end();

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            // Optionally log parts of stdout to see progress
            if (chunk.includes('thinking')) console.log('[Codex] AI is thinking...');
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (err) => {
            console.error("[Codex] Spawn Error:", err);
            resolve(`[ERROR] ${err.message}`);
        });

        child.on('close', (code) => {
            console.log(`[Codex] Process finished with code ${code}`);

            if (code !== 0) {
                console.warn(`[Codex] Stderr: ${stderr}`);
            }

            // The actual content is usually at the end after the banner and thinking logs
            // codex exec output often includes headers we might need to strip
            let result = stdout.trim();

            // If stdout is empty, fallback to stderr for error messages
            if (!result && code !== 0) {
                resolve(`[ERROR] AI tool failed (Code ${code}). ${stderr.trim()}`);
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Checks if codex-cli is available.
 */
export async function checkCodexAvailability() {
    const codexCmd = process.env.CODEX_COMMAND || 'codex';
    return new Promise((resolve) => {
        let cmd = codexCmd;
        let args = ['--version'];

        if (codexCmd.startsWith('npx ')) {
            cmd = 'npx';
            args = [codexCmd.split(' ')[1], '--version'];
        }

        const child = spawn(cmd, args);
        child.on('error', () => resolve({ available: false, command: codexCmd }));
        child.on('close', (code) => {
            resolve({ available: code === 0, command: codexCmd });
        });
    });
}
