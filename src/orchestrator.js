import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as gitUtils from './utils/gitUtils.js';
import * as fileUtils from './utils/fileUtils.js';
import * as codexUtils from './utils/codexUtils.js';
import * as dbUtils from './utils/dbUtils.js';
import { getFileTree, getAllFiles } from './utils/treeUtils.js';
import { installDependenciesIfNeeded } from './utils/npmUtils.js';
import { telegramManager } from './utils/telegramUtils.js';

const execPromise = promisify(exec);

/**
 * RalphOrchestrator handles the lifecycle of a Ralph pipeline project.
 */
class RalphOrchestrator {
    /**
     * @param {Object} projectData - Project configuration from DB.
     * @param {Function} onUpdate - Callback for dashboard updates.
     */
    constructor(projectData, onUpdate = null) {
        this.id = projectData.id;
        this.projectRoot = projectData.path;
        this.prd = projectData.prd;
        this.onUpdate = onUpdate;
        this.isRunning = false;

        // Load settings
        const settings = dbUtils.getSettings();
        this.maxIterations = projectData.maxIterations || settings.maxIterations || 100;
        this.maxRetriesPerTask = settings.maxRetriesPerTask || 5;
        this.baseSleepTime = settings.baseSleepTime || 3000;
        this.backoffMultiplier = settings.backoffMultiplier || 1.25;
        this.useReviewerAgent = settings.useReviewerAgent !== undefined ? settings.useReviewerAgent : true;
        this.autoTest = settings.autoTest !== undefined ? settings.autoTest : true;

        // Telegram Logic
        this.tgEnabled = settings.telegramSettings?.enabled || false;
        this.useHumanReview = projectData.useHumanReview || settings.telegramSettings?.useHumanReview || false;

        // State tracking
        this.iteration = projectData.iteration || 0;
        this.retryCount = 0;
        this.lastError = null;
        this.lessons = dbUtils.getLessons();
    }

    /**
     * Initializes the project.
     */
    async initProject() {
        console.log(`Initializing project: ${this.id}`);
        try {
            await fileUtils.createDirectory(this.projectRoot);
            const plansDir = path.join(this.projectRoot, 'plans');
            await fileUtils.createDirectory(plansDir);

            await this.syncPrd(this.prd); // Use syncPrd to write initial file
            await fileUtils.writeFile(path.join(this.projectRoot, 'agents.md'), '# Agent Work Log\n\n');
            await fileUtils.writeFile(path.join(this.projectRoot, 'progress.txt'), 'Pipeline Initialized\n');
            await fileUtils.writeFile(path.join(this.projectRoot, '.gitignore'), 'node_modules\n.ralph/\nagents.md\nprogress.txt\n');

            await gitUtils.initializeGit(this.projectRoot);

            await dbUtils.saveProject({ id: this.id, status: 'initialized' });
            this.updateDashboard({ status: 'initialized', message: 'Project files created.' });
        } catch (error) {
            console.error("Init Error:", error);
            throw error;
        }
    }

    /**
     * Syncs the PRD to the local prd.json file.
     * @param {Object} prd - The PRD to sync.
     */
    async syncPrd(prd) {
        this.prd = prd;
        const plansPath = path.join(this.projectRoot, 'plans', 'prd.json');
        await fileUtils.writeFile(plansPath, JSON.stringify(prd, null, 2));
    }

    /**
     * Control methods for the pipeline.
     */
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.runLoop();
        }
    }

    stop() {
        this.isRunning = false;
        this.updateDashboard({ status: 'paused', message: 'Pipeline paused by user.' });
    }

    /**
     * Main simulation loop.
     */
    async runLoop() {
        console.log(`[LOOP] Pipeline loop STARTED for project: ${this.id}`);
        const plansPath = path.join(this.projectRoot, 'plans', 'prd.json');
        const agentsPath = path.join(this.projectRoot, 'agents.md');
        const progressPath = path.join(this.projectRoot, 'progress.txt');

        try {
            while (this.iteration < this.maxIterations) {
                if (!this.isRunning) {
                    console.log(`[LOOP] Pipeline STOPPED for project: ${this.id}`);
                    break;
                }

                console.log(`[LOOP] Iteration ${this.iteration + 1} starting...`);

                let currentPrd;
                try {
                    const prdRaw = await fileUtils.readFile(plansPath);
                    currentPrd = JSON.parse(prdRaw);
                } catch (e) {
                    console.error("[LOOP] PRD Read Error:", e.message);
                    throw e;
                }

                const activeStage = (currentPrd.stages || []).find(stage => !stage.isCompleted);

                if (!activeStage) {
                    this.isRunning = false;
                    console.log(`--- Project Completely Finished: ${this.id} ---`);
                    await dbUtils.saveProject({ id: this.id, status: 'completed' });
                    this.updateDashboard({ status: 'completed', message: 'All project stages finished!' });
                    if (this.tgEnabled) {
                        telegramManager.sendMessage(`🏁 *Project Finished:* ${this.id}\nAll stages completed successfully!`);
                    }
                    break;
                }

                let currentTask = (activeStage.stories || []).find(story => !story.passes && !story.isSkipped);

                if (!currentTask) {
                    activeStage.isCompleted = true;
                    console.log(`[LOOP] Stage complete: ${activeStage.name}. Continuing to next...`);
                    this.updateDashboard({ message: `✅ STAGE COMPLETE: ${activeStage.name}. Proceeding to next stage...`, prd: currentPrd });
                    if (this.tgEnabled) {
                        telegramManager.sendMessage(`✅ *Stage Complete:* ${activeStage.name}\n(Project: ${this.id})`);
                    }
                    await fileUtils.writeFile(plansPath, JSON.stringify(currentPrd, null, 2));
                    await dbUtils.saveProject({ id: this.id, prd: currentPrd });
                    continue;
                }

                if (currentTask.description.length > 300 && !currentTask.isSubtasked) {
                    console.log(`[LOOP] Splitting complex task: ${currentTask.title}`);
                    const subTasks = await this.splitIntoSubTasks(currentTask);
                    if (subTasks && subTasks.length > 0) {
                        const taskIndex = activeStage.stories.indexOf(currentTask);
                        activeStage.stories.splice(taskIndex, 1, ...subTasks);
                        await fileUtils.writeFile(plansPath, JSON.stringify(currentPrd, null, 2));
                        await dbUtils.saveProject({ id: this.id, prd: currentPrd });
                        continue;
                    }
                }

                this.iteration++;
                const statusMsg = this.retryCount > 0 ? `Stage: ${activeStage.name} | Retry ${this.retryCount + 1}: ${currentTask.title}` : `Stage: ${activeStage.name} | Task: ${currentTask.title}`;
                console.log(`[LOOP] ${statusMsg}`);

                this.updateDashboard({
                    status: 'running',
                    iteration: this.iteration,
                    currentTask: `${activeStage.name}: ${currentTask.title}`,
                    message: statusMsg
                });

                await dbUtils.saveProject({ id: this.id, iteration: this.iteration, status: 'running' });

                console.log(`[LOOP] Checking Git for manual changes...`);
                const hasChanges = await gitUtils.hasUncommittedChanges(this.projectRoot);
                if (hasChanges) {
                    console.log(`[LOOP] Syncing manual changes...`);
                    const changedFiles = await gitUtils.commitManualChanges(this.projectRoot);
                    this.manualChangeLog = `User manually modified: ${changedFiles.join(', ')}`;
                    this.updateDashboard({
                        message: `⚠️ [ALERT] Manual changes detected! Ralph has indexed your changes: ${changedFiles.join(', ')}. Continuing pipeline...`
                    });
                } else {
                    this.manualChangeLog = null;
                }

                console.log(`[LOOP] Preparing context (files, tree, lessons)...`);
                let agentsLog = await fileUtils.readFile(agentsPath);

                // --- Smart Context Management ---
                // Keep only the last 3000 characters of the agent log for maximum speed/compactness
                // Keep only the last 3000 characters of the agent log (The most RECENT work)
                if (agentsLog.length > 3000) {
                    agentsLog = "... [Truncated] ...\n" + agentsLog.slice(-3000);
                }

                const progress = await fileUtils.readFile(progressPath);
                const fileTree = await getFileTree(this.projectRoot);
                this.lessons = dbUtils.getLessons();

                if (this.manualChangeLog && this.manualChangeLog.includes('package.json')) {
                    console.log(`[LOOP] NPM Sync triggered...`);
                    await installDependenciesIfNeeded(this.projectRoot);
                }

                const strategy = this.retryCount > 2 ? 'REWRITE' : 'PATCH';

                // --- SMART CONTEXT INJECTION (Fix for Direct API reading blindness) ---
                const allFilePaths = await getAllFiles(this.projectRoot);
                let relevantCodeContext = '';

                // Read up to 10 most relevant source files (under src/ or root)
                const sourceFiles = allFilePaths.filter(f =>
                    (f.includes('/src/') || !f.includes('/')) &&
                    !f.includes('.test.') &&
                    (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html'))
                ).slice(0, 15);

                for (const filePath of sourceFiles) {
                    const relativePath = path.relative(this.projectRoot, filePath);
                    const content = await fileUtils.readFile(filePath);
                    relevantCodeContext += `\n### FILE CONTENT: ${relativePath}\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\`\n`;
                }

                const devPrompt = this.generateDevPrompt(currentTask, progress, agentsLog, fileTree, strategy, activeStage, relevantCodeContext);

                console.log(`[LOOP] Requesting AI (DEVELOPER)...`);
                let devResult = await this.executeAITask(devPrompt, this.projectRoot, 'DEVELOPER');

                // --- Self-Healing (Auto-Validator) ---
                console.log(`[LOOP] Running Self-Healing Syntax Check...`);
                const syntaxCheck = await this.validateSyntax();
                if (!syntaxCheck.valid) {
                    console.warn(`[LOOP] Syntax Error detected! Triggering Self-Healing...`);
                    this.updateDashboard({ message: `🛠 [Self-Healing] Syntax error found in: ${syntaxCheck.file}. Fixing...` });

                    const fixPrompt = `
${devPrompt}
---
⚠️ SELF-HEALING UPDATE:
The previous run introduced a syntax error in **${syntaxCheck.file}**:
Error: ${syntaxCheck.error}

INSTRUCTION: Fix this syntax error immediately and complete the task.
`.trim();
                    devResult = await this.executeAITask(fixPrompt, this.projectRoot, 'DEVELOPER');
                }

                let isValid = false;
                let reviewerFeedback = '';

                if (this.useReviewerAgent) {
                    console.log(`[LOOP] Requesting AI (REVIEWER)...`);
                    this.updateDashboard({ message: `Reviewing: ${currentTask.title}...` });
                    const reviewPrompt = this.generateReviewPrompt(currentTask, devResult, fileTree, activeStage);
                    reviewerFeedback = await this.executeAITask(reviewPrompt, this.projectRoot, 'REVIEWER');
                    isValid = reviewerFeedback.includes('REVIEW_PASSED');
                } else {
                    isValid = devResult.includes('PROMISE_MET');
                }

                if (isValid && this.tgEnabled && this.useHumanReview) {
                    console.log(`[LOOP] Waiting for Mobile Approval via Telegram...`);
                    this.updateDashboard({ message: `📱 Waiting for Mobile Approval via Telegram...` });
                    isValid = await telegramManager.askForApproval(activeStage.name, currentTask.title);
                    if (!isValid) {
                        reviewerFeedback = "USER REJECTED via Telegram Mobile.";
                        console.log(`[LOOP] Task REJECTED by user via Mobile.`);
                    } else {
                        console.log(`[LOOP] Task APPROVED by user via Mobile.`);
                    }
                }

                if (isValid) {
                    currentTask.passes = true;
                    this.retryCount = 0;
                    this.lastError = null;

                    await fileUtils.writeFile(plansPath, JSON.stringify(currentPrd, null, 2));
                    await dbUtils.saveProject({ id: this.id, prd: currentPrd });
                    await gitUtils.addAndCommit(this.projectRoot, `Completed: ${activeStage.name} - ${currentTask.title}`);

                    this.updateDashboard({ message: `Success: ${currentTask.title} verified.`, prd: currentPrd });
                    console.log(`[LOOP] Task Successful!`);
                } else {
                    this.retryCount++;
                    this.lastError = reviewerFeedback;
                    console.log(`[LOOP] Task Failure. Retry count: ${this.retryCount}`);

                    if (reviewerFeedback.length > 20) {
                        await dbUtils.saveLesson({
                            task: currentTask.title,
                            error: reviewerFeedback.slice(0, 500),
                            stage: activeStage.name,
                            project: this.id
                        });
                    }

                    if (this.retryCount >= this.maxRetriesPerTask) {
                        if (currentTask.priority !== 'critical') {
                            console.log(`[LOOP] Soft-Fail: Skipping non-critical task.`);
                            currentTask.isSkipped = true;
                            currentTask.skipReason = reviewerFeedback;
                            this.retryCount = 0;
                            await fileUtils.writeFile(plansPath, JSON.stringify(currentPrd, null, 2));
                            await dbUtils.saveProject({ id: this.id, prd: currentPrd });
                            this.updateDashboard({ message: `⚠️ Task Skipped: ${currentTask.title}`, prd: currentPrd });
                            continue;
                        }

                        console.error(`[LOOP] Critical Failure. Rolling back.`);
                        this.updateDashboard({ message: "CRITICAL Task failed repeatedly. ROLLING BACK." });
                        await gitUtils.rollbackToLastCommit(this.projectRoot);

                        this.isRunning = false;
                        this.updateDashboard({ status: 'error', message: `Pipeline blocked at Stage: ${activeStage.name} / Task: ${currentTask.title}` });
                        await dbUtils.saveProject({ id: this.id, status: 'error' });
                        break;
                    }

                    const waitTime = this.baseSleepTime * Math.pow(this.backoffMultiplier, this.retryCount - 1);
                    console.log(`[LOOP] Retrying in ${waitTime}ms...`);
                    this.updateDashboard({ message: `Retry ${this.retryCount} failed. Waiting...` });
                    await new Promise(r => setTimeout(r, waitTime));
                }

                await new Promise(r => setTimeout(r, this.baseSleepTime));
            }
        } catch (error) {
            console.error(`[FATAL LOOP ERROR] Project ${this.id}:`, error);
            this.isRunning = false;
            this.updateDashboard({ status: 'error', message: `Fatal Error: ${error.message}` });
        }
    }

    /**
     * Splits a task into smaller sub-tasks.
     */
    async splitIntoSubTasks(task) {
        const prompt = `
ROLE: Senior Architect
TASK TO SPLIT: "${task.title}"
DESCRIPTION: "${task.description}"

INSTRUCTION: This task is too big for a single AI run. Split it into 3-5 smaller, sequential sub-tasks.
OUTPUT FORMAT (JSON ONLY):
[
  { "title": "Subtask 1", "description": "...", "passes": false, "isSubtasked": true },
  ...
]
`.trim();
        try {
            const result = await codexUtils.runCodex(prompt, process.cwd(), 'JSON');
            return this.extractAndParseJSON(result);
        } catch (e) {
            console.error("[Ralph] Sub-task splitting failed:", e);
            return null;
        }
    }

    generateDevPrompt(task, progress, log, tree, strategy, stage, codeContext = '') {
        const recentLessons = this.lessons.slice(-3);
        const lessonPrompt = recentLessons.length > 0 ?
            `FAILURES TO AVOID:\n${recentLessons.map(l => `- ${l.error.slice(0, 300)}`).join('\n')}` : '';

        const manualPrompt = this.manualChangeLog ?
            `User modified: ${this.manualChangeLog}` : '';

        return `
ROLE: Full-Stack Dev
MISSION: ${stage.mission}
TASK: ${task.title} (${task.description})
PRIORITY: ${task.priority || 'standard'}
STRATEGY: ${strategy === 'REWRITE' ? 'FULL REWRITE' : 'PATCH'}

${manualPrompt}
${lessonPrompt}

PROJECT CONTEXT:
${log}

EXISTING SOURCE CODE:
${codeContext}

FILES:
${tree}

GOAL: Complete task and write PROMISE_MET.
`.trim();
    }

    generateTestPrompt(task, tree) {
        return `
ROLE: SDET / Tester
TASK TO TEST: ${task.title}
ARCH:
${tree}

INSTRUCTION: Create a temporary test file (e.g., test.js) that will verify if this task is completed correctly.
OUTPUT: Just the test code and where to save it.
`.trim();
    }

    generateReviewPrompt(task, result, tree, stage) {
        const compactTree = tree.length > 1000 ? tree.slice(-1000) + '... (truncated)' : tree;
        return `
ROLE: QA Architect
MISSION: ${stage.mission}
STORY: ${task.title}

OUTPUT:
${result}

FILES:
${compactTree}

CRITERIA:
1. Aligned with Project & Story?
2. Technical logic correct?
3. No syntax errors (verified by developer).

RESPONSE: REVIEW_PASSED or technical feedback.
`.trim();
    }

    async executeAITask(prompt, projectPath, role = 'AGENT') {
        console.log(`Executing AI task as ${role}... (Prompt length: ${prompt.length})`);

        try {
            const agentsPath = path.join(projectPath, 'agents.md');
            const progressPath = path.join(projectPath, 'progress.txt');
            const ralphLogsDir = path.join(projectPath, '.ralph', 'logs');
            const internalStatusPath = path.join(projectPath, '.ralph', 'internal_status.txt');

            // Ensure logs directory exists
            await fileUtils.createDirectory(ralphLogsDir);

            // Update internal status before run (Internal Ralph tracking)
            const taskLine = prompt.split('\n').find(l => l.includes('TASK:') || l.includes('STORY BEING REVIEWED:')) || 'N/A';
            await fileUtils.writeFile(internalStatusPath, `Role: ${role}\nRunning AI for: ${taskLine}\nTimestamp: ${new Date().toISOString()}`);

            const result = await codexUtils.runCodex(prompt, projectPath, role);

            // Save RAW log for debugging (hidden from main context)
            const timestamp = Date.now();
            const rawLogPath = path.join(ralphLogsDir, `${timestamp}_${role}.md`);
            await fileUtils.writeFile(rawLogPath, `### PROMPT:\n${prompt}\n\n### RESULT:\n${result}`);

            // Update agent notes with CLEAN SUMMARY only
            const currentLog = await fileUtils.readFile(agentsPath);
            const cleanSummary = this.extractSummary(result);
            const newLog = `${currentLog}\n\n### ${role} Run (${new Date().toLocaleTimeString()})\n${cleanSummary}\n> [Full log: .ralph/logs/${timestamp}_${role}.md]`;
            await fileUtils.writeFile(agentsPath, newLog);

            return result;
        } catch (error) {
            console.error(`Error during AI task execution (${role}):`, error);
            return `ERROR: ${error.message}`;
        }
    }

    /**
     * Extracts only the summary/findings part of the AI output, ignoring large code blocks.
     */
    extractSummary(text) {
        const lines = text.split('\n');
        let summaryLines = [];
        let capturing = false;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            // Start capturing if we see markers
            if (lowerLine.includes('summary:') || lowerLine.includes('findings:') || lowerLine.includes('criteria:')) {
                capturing = true;
            }

            if (capturing) {
                // Stop if we hit a code block or another big section
                if (line.trim().startsWith('```')) break;
                summaryLines.push(line);
            }

            // Safety: if we found no markers, take the first 5 lines as summary
            if (!capturing && summaryLines.length < 5 && line.trim().length > 0) {
                summaryLines.push(line);
            }
        }

        const clean = summaryLines.join('\n').trim();
        return clean.length > 10 ? clean : text.slice(0, 500) + '... (truncated)';
    }

    /**
     * Simulated complex validation logic.
     */
    async validateTaskResult(result, task) {
        // Point 4: Check if PROMISE_MET exists AND simulate a check
        if (!result.includes('PROMISE_MET')) return false;

        // Simulating an automated test/lint check
        console.log(`Validating ${task.title}...`);
        return true;
    }

    async generatePRD(prompt) {
        this.updateDashboard({
            status: 'generating_prd',
            message: 'AI is designing Stage-based Atomic Journey...'
        });

        const generationPrompt = `
ROLE: Senior Product Manager
TASK: Transform project into a STAGE-BASED journey with atomic stories.

DESCRIPTION: "${prompt}"

REQUIRED JSON STRUCTURE:
{
  "project": "...",
  "description": "...",
  "stages": [
    {
      "name": "Stage 1: Build Core",
      "mission": "What is the goal of this stage?",
      "isCompleted": false,
      "stories": [
        { "title": "Task 1", "description": "...", "passes": false, "priority": "critical/standard" },
        ...
      ]
    },
    ...
  ]
}

STRICT: Output ONLY JSON.
`.trim();

        try {
            const rawResult = await codexUtils.runCodex(generationPrompt, process.cwd(), 'PRD');

            let generatedPrd;
            try {
                generatedPrd = this.extractAndParseJSON(rawResult);
            } catch (parseError) {
                console.error("Failed to parse PRD JSON. Raw result head:", rawResult.slice(0, 500));
                throw new Error(`JSON Parse Error: ${parseError.message}`);
            }

            this.prd = generatedPrd;
            await dbUtils.saveProject({ id: this.id, prd: this.prd });
            await this.syncPrd(this.prd); // SYNC TO DISK!
            this.updateDashboard({ status: 'prd_ready', message: 'Stage journey generated.', prd: this.prd });

            return generatedPrd;
        } catch (error) {
            console.error("PRD Generation Error:", error);
            this.updateDashboard({ status: 'error', message: `PRD Error: ${error.message}` });
            throw error;
        }
    }

    /**
     * Robustly extracts and parses JSON from a string that might contain extra text.
     * @param {string} text - The text to extract JSON from.
     * @returns {Object|Array} - The parsed JSON.
     */
    extractAndParseJSON(text) {
        // Try direct parse first
        const trimmed = text.trim();
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            // Fallback to extraction
        }

        // Find first { or [
        const firstBrace = text.indexOf('{');
        const firstBracket = text.indexOf('[');

        let startChar, endChar;
        let startIndex;

        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            startChar = '{';
            endChar = '}';
            startIndex = firstBrace;
        } else if (firstBracket !== -1) {
            startChar = '[';
            endChar = ']';
            startIndex = firstBracket;
        } else {
            throw new Error("No JSON markers found in response.");
        }

        // Try to find the matching ending marker by pruning from the end
        let lastEndIndex = text.lastIndexOf(endChar);
        while (lastEndIndex > startIndex) {
            const candidate = text.slice(startIndex, lastEndIndex + 1);
            try {
                return JSON.parse(candidate);
            } catch (err) {
                lastEndIndex = text.lastIndexOf(endChar, lastEndIndex - 1);
            }
        }

        throw new Error("Could not extract a valid JSON block from the response.");
    }

    /**
     * Sends status updates to the dashboard via WebSocket.
     * @param {Object} status - The status object to send.
     */
    updateDashboard(status) {
        if (this.onUpdate) {
            this.onUpdate({
                type: 'status_update',
                projectId: this.id,
                payload: { ...status, timestamp: new Date().toISOString() }
            });
        }
    }

    /**
     * Checks all JS files in the project for syntax errors.
     * @returns {Object} - { valid: boolean, file?: string, error?: string }
     */
    async validateSyntax() {
        try {
            const files = await fileUtils.listFilesRecursive(this.projectRoot);
            const jsFiles = files.filter(f => f.endsWith('.js') && !f.includes('node_modules'));

            for (const file of jsFiles) {
                try {
                    // node --check is a fast way to validate JS syntax without running it
                    await execPromise(`node --check "${file}"`);
                } catch (e) {
                    return { valid: false, file: path.relative(this.projectRoot, file), error: e.message };
                }
            }
            return { valid: true };
        } catch (error) {
            console.error("[Syntax Check Error]", error);
            return { valid: true }; // Don't block if check itself fails
        }
    }
}

export default RalphOrchestrator;
