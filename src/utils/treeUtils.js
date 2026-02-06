import fs from 'fs-extra';
import path from 'path';

/**
 * Generates a visual tree represention of a directory.
 * @param {string} dir - Directory to scan.
 * @param {string} prefix - Internal recursion prefix.
 * @returns {Promise<string>}
 */
export async function getFileTree(dir, prefix = '') {
    let tree = '';
    const files = await fs.readdir(dir);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ignored = ['node_modules', '.git', '.DS_Store', 'dist', 'build', 'target', '.next', 'package-lock.json', '.ralph'];
        if (ignored.includes(file) || file.endsWith('.tsbuildinfo')) continue;

        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        const isLast = i === files.length - 1;

        tree += `${prefix}${isLast ? '└── ' : '├── '}${file}\n`;

        if (stats.isDirectory()) {
            tree += await getFileTree(filePath, `${prefix}${isLast ? '    ' : '│   '}`);
        }
    }

    return tree;
}

/**
 * Recursively gets all files in a directory (filtered).
 */
export async function getAllFiles(dir, allFiles = []) {
    const files = await fs.readdir(dir);
    for (const file of files) {
        const ignored = ['node_modules', '.git', '.DS_Store', 'dist', 'build', 'target', '.next', 'package-lock.json', '.ralph'];
        if (ignored.includes(file)) continue;

        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
            await getAllFiles(filePath, allFiles);
        } else {
            allFiles.push(filePath);
        }
    }
    return allFiles;
}
