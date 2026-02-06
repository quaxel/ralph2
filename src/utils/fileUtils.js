import fs from 'fs-extra';

/**
 * fileUtils provides helper functions for file system operations.
 */

/**
 * Recursively creates a directory at the specified path.
 * @param {string} path - The path to the directory.
 * @returns {Promise<void>}
 */
export async function createDirectory(path) {
    try {
        await fs.ensureDir(path);
    } catch (error) {
        console.error(`Failed to create directory at ${path}:`, error);
        throw error;
    }
}

/**
 * Writes content to a file at the specified path.
 * @param {string} path - The path to the file.
 * @param {string} content - The content to write.
 * @returns {Promise<void>}
 */
export async function writeFile(path, content) {
    try {
        await fs.writeFile(path, content, 'utf8');
    } catch (error) {
        console.error(`Failed to write file at ${path}:`, error);
        throw error;
    }
}

/**
 * Reads content from a file at the specified path.
 * @param {string} path - The path to the file.
 * @returns {Promise<string>} - The file content.
 */
export async function readFile(path) {
    try {
        return await fs.readFile(path, 'utf8');
    } catch (error) {
        console.error(`Failed to read file at ${path}:`, error);
        throw error;
    }
}

/**
 * Deletes a directory and its contents at the specified path.
 * @param {string} path - The path to the directory.
 * @returns {Promise<void>}
 */
export async function deleteDirectory(path) {
    try {
        await fs.remove(path);
    } catch (error) {
        console.error(`Failed to delete directory at ${path}:`, error);
        throw error;
    }
}
/**
 * List all files in a directory recursively.
 * @param {string} dir - The directory to list.
 * @returns {Promise<string[]>} - A list of absolute file paths.
 */
export async function listFilesRecursive(dir) {
    let results = [];
    const list = await fs.readdir(dir);

    for (const file of list) {
        const filePath = `${dir}/${file}`;
        const stat = await fs.stat(filePath);

        if (stat && stat.isDirectory()) {
            const recursiveResults = await listFilesRecursive(filePath);
            results = results.concat(recursiveResults);
        } else {
            results.push(filePath);
        }
    }
    return results;
}
