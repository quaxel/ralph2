import { JSONFilePreset } from 'lowdb/node';

/**
 * dbUtils provides persistent storage for project and pipeline state.
 */

const defaultData = {
    projects: [],
    settings: {
        maxIterations: 100,
        codexPath: 'codex'
    }
};

let db;

/**
 * Initializes the database.
 */
export async function initDb() {
    db = await JSONFilePreset('data/db.json', defaultData);

    // Migration/Fix: Ensure codexPath is updated to 'codex'
    if (db.data.settings.codexPath === 'npx codex-cli') {
        db.data.settings.codexPath = 'codex';
        await db.write();
    }

    return db;
}

/**
 * Adds or updates a project in the database.
 * @param {Object} project - Project data.
 */
export async function saveProject(project) {
    const index = db.data.projects.findIndex(p => p.id === project.id);
    if (index > -1) {
        db.data.projects[index] = { ...db.data.projects[index], ...project, updatedAt: new Date().toISOString() };
    } else {
        db.data.projects.push({ ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    await db.write();
}

/**
 * Gets all projects.
 */
export function getProjects() {
    return db.data.projects;
}

/**
 * Gets a project by ID.
 */
export function getProject(id) {
    return db.data.projects.find(p => p.id === id);
}
