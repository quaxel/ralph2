import { simpleGit } from 'simple-git';

/**
 * gitUtils provides helper functions for Git operations.
 */

/**
 * Initializes a new Git repository at the specified path and creates an initial commit.
 * @param {string} projectPath - The absolute path to the project directory.
 * @returns {Promise<void>}
 */
export async function initializeGit(projectPath) {
    const git = simpleGit(projectPath);
    try {
        await git.init();
        // Check if there are files to commit before initial commit
        const status = await git.status();
        if (status.files.length > 0) {
            await git.add('.');
            await git.commit('initial-commit: Project initialized');
        }
    } catch (error) {
        console.error(`Git initialization failed at ${projectPath}:`, error);
        throw error;
    }
}

/**
 * Adds all changes and commits them with the given message.
 * @param {string} projectPath - The absolute path to the project directory.
 * @param {string} message - The commit message.
 * @returns {Promise<void>}
 */
export async function addAndCommit(projectPath, message) {
    const git = simpleGit(projectPath);
    try {
        await git.add('.');
        await git.commit(message);
    } catch (error) {
        console.error(`Git commit failed at ${projectPath}:`, error);
        throw error;
    }
}

/**
 * Retrieves the message of the latest commit.
 * @param {string} projectPath - The absolute path to the project directory.
 * @returns {Promise<string|null>} - The latest commit message or null if no commits exist.
 */
export async function getLatestCommitMessage(projectPath) {
    const git = simpleGit(projectPath);
    try {
        const log = await git.log({ n: 1 });
        return log.latest ? log.latest.message : null;
    } catch (error) {
        // Typically fails if there are no commits yet
        return null;
    }
}
