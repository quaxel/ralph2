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
/**
 * Reverts the project to the last stable commit.
 * @param {string} projectPath - The absolute path to the project directory.
 */
/**
 * Checks if there are any uncommitted changes in the repository.
 * @param {string} projectPath 
 * @returns {Promise<boolean>}
 */
export async function hasUncommittedChanges(projectPath) {
    const git = simpleGit(projectPath);
    try {
        const status = await git.status();
        const filteredFiles = status.files.filter(f =>
            !['agents.md', 'progress.txt'].includes(f.path) &&
            !f.path.startsWith('.ralph/')
        );
        return filteredFiles.length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * Commits manual changes with a specific prefix.
 * @param {string} projectPath 
 * @returns {Promise<string[]>} List of changed files
 */
export async function commitManualChanges(projectPath) {
    const git = simpleGit(projectPath);
    try {
        const status = await git.status();
        const files = status.files
            .map(f => f.path)
            .filter(f => !['agents.md', 'progress.txt'].includes(f) && !f.startsWith('.ralph/'));

        if (files.length === 0) return [];

        await git.add(files);
        await git.commit(`[USER_MANUAL_CHANGE] Detected changes in: ${files.join(', ')}`);
        return files;
    } catch (error) {
        console.error("Failed to commit manual changes:", error);
        return [];
    }
}

export async function rollbackToLastCommit(projectPath) {
    const git = simpleGit(projectPath);
    try {
        console.warn(`[Git] Rolling back ${projectPath} to last stable commit and cleaning untracked files...`);
        await git.reset(['--hard', 'HEAD']);
        await git.clean('f', ['-d']); // clean untracked files and directories
    } catch (error) {
        console.error(`Git rollback failed at ${projectPath}:`, error);
    }
}
