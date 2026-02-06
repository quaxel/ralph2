import { JSONFilePreset } from 'lowdb/node';

/**
 * dbUtils provides persistent storage for project and pipeline state.
 */

const defaultData = {
    projects: [],
    lessons: [], // Global learning log
    settings: {
        maxIterations: 100,
        codexPath: 'codex',
        maxRetriesPerTask: 5,
        baseSleepTime: 3000,
        backoffMultiplier: 1.25,
        useReviewerAgent: true,
        autoTest: true,
        telegramSettings: {
            enabled: false,
            botToken: '',
            chatId: '',
            useHumanReview: false // Global default for human review
        }
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

/**
 * Gets global settings.
 */
export function getSettings() {
    return db.data.settings;
}

/**
 * Saves a lesson learned from a failure.
 */
export async function saveLesson(lesson) {
    if (!db.data.lessons) db.data.lessons = [];
    db.data.lessons.push({
        ...lesson,
        timestamp: new Date().toISOString()
    });
    // Keep only last 50 lessons to avoid bloat
    if (db.data.lessons.length > 50) db.data.lessons.shift();
    await db.write();
}

/**
 * Gets all lessons.
 */
export function getLessons() {
    return db.data.lessons || [];
}

/**
 * Deletes a specific lesson by index or content match.
 */
export async function deleteLesson(timestamp) {
    db.data.lessons = db.data.lessons.filter(l => l.timestamp !== timestamp);
    await db.write();
}

/**
 * Updates only the PRD of a project.
 */
export async function updateProjectPrd(id, prd) {
    const index = db.data.projects.findIndex(p => p.id === id);
    if (index > -1) {
        db.data.projects[index].prd = prd;
        db.data.projects[index].updatedAt = new Date().toISOString();
        await db.write();
    }
}

export async function updateSettings(settings) {
    db.data.settings = settings;
    await db.write();
}
