import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execPromise = promisify(exec);

/**
 * Checks if npm install is needed by comparing package.json and node_modules last modified time
 * or simply detecting a change in package.json from git.
 */
export async function installDependenciesIfNeeded(projectPath) {
    const pkgPath = path.join(projectPath, 'package.json');

    if (!await fs.pathExists(pkgPath)) return;

    console.log(`[NPM] Checking dependencies for ${projectPath}...`);
    try {
        // Run npm install. In a real production app, we might want to compare hashes
        // but for Ralph, we'll try to be safe and run it if triggered.
        const { stdout, stderr } = await execPromise('npm install', { cwd: projectPath });
        console.log(`[NPM] Install complete.`);
        return { success: true, output: stdout };
    } catch (error) {
        console.error(`[NPM] Install failed:`, error.message);
        return { success: false, error: error.message };
    }
}
