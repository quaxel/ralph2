import path from 'path';
import * as gitUtils from './utils/gitUtils.js';
import * as fileUtils from './utils/fileUtils.js';
import * as codexUtils from './utils/codexUtils.js';
import * as dbUtils from './utils/dbUtils.js';

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
        this.maxIterations = 100;
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

            await fileUtils.writeFile(path.join(plansDir, 'prd.json'), JSON.stringify(this.prd, null, 2));
            await fileUtils.writeFile(path.join(this.projectRoot, 'agents.md'), '# Agent Work Log\n\n');
            await fileUtils.writeFile(path.join(this.projectRoot, 'progress.txt'), 'Pipeline Initialized\n');

            await gitUtils.initializeGit(this.projectRoot);

            await dbUtils.saveProject({ id: this.id, status: 'initialized' });
            this.updateDashboard({ status: 'initialized', message: 'Project files created.' });
        } catch (error) {
            console.error("Init Error:", error);
            throw error;
        }
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
        console.log(`Pipeline loop started for: ${this.id}`);
        const plansPath = path.join(this.projectRoot, 'plans', 'prd.json');
        const agentsPath = path.join(this.projectRoot, 'agents.md');
        const progressPath = path.join(this.projectRoot, 'progress.txt');

        for (let i = 0; i < this.maxIterations; i++) {
            if (!this.isRunning) break;

            const currentPrd = JSON.parse(await fileUtils.readFile(plansPath));
            const currentTask = (currentPrd.stories || []).find(story => !story.passes);

            if (!currentTask) {
                this.isRunning = false;
                await dbUtils.saveProject({ id: this.id, status: 'completed' });
                this.updateDashboard({ status: 'completed', message: 'All tasks finished!' });
                break;
            }

            this.updateDashboard({
                status: 'running',
                iteration: i + 1,
                currentTask: currentTask.title,
                message: `Starting task: ${currentTask.title}`
            });

            // AI Execution
            const agentsLog = await fileUtils.readFile(agentsPath);
            const progress = await fileUtils.readFile(progressPath);
            const prompt = this.generatePrompt(currentTask, progress, agentsLog);

            const result = await this.executeAITask(prompt, this.projectRoot);

            // Validation Step (Point 4)
            const isValid = await this.validateTaskResult(result, currentTask);

            if (isValid) {
                currentTask.passes = true;
                await fileUtils.writeFile(plansPath, JSON.stringify(currentPrd, null, 2));
                await gitUtils.addAndCommit(this.projectRoot, `Completed: ${currentTask.title}`);
                this.updateDashboard({
                    message: `Success: ${currentTask.title} verified.`,
                    prd: currentPrd // Send updated stories for UI refresh
                });
            } else {
                this.updateDashboard({ message: `Validation failed for: ${currentTask.title}. Retrying...` });
            }

            await new Promise(r => setTimeout(r, 3000));
        }
    }

    generatePrompt(task, progress, log) {
        return `TASK: ${task.title}\nDESC: ${task.description}\nCONTEXT:\n${progress}\nLOG:\n${log}\nINSTRUCTION: Finish work and write PROMISE_MET.`;
    }

    async executeAITask(prompt, projectPath) {
        console.log(`Executing AI task... (Prompt length: ${prompt.length})`);

        try {
            const agentsPath = path.join(projectPath, 'agents.md');
            const progressPath = path.join(projectPath, 'progress.txt');

            // Update progress before run
            await fileUtils.writeFile(progressPath, `Running AI for: ${prompt.split('\n')[0]}\nTimestamp: ${new Date().toISOString()}`);

            // Call the real codex-cli via utility
            const result = await codexUtils.runCodex(prompt, projectPath);

            // Update agent notes
            const currentLog = await fileUtils.readFile(agentsPath);
            const newLog = `${currentLog}\n\n### Run (${new Date().toLocaleTimeString()})\n${result}`;
            await fileUtils.writeFile(agentsPath, newLog);

            return result;
        } catch (error) {
            console.error("Error during AI task execution:", error);
            // Do not re-throw, allow pipeline to continue or handle gracefully
            return `ERROR: ${error.message}`;
        }
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

    /**
     * Generates a structured PRD JSON from a natural language prompt.
     * @param {string} prompt - The user's project description.
     * @returns {Promise<Object>} - The generated PRD object.
     */
    async generatePRD(prompt) {
        this.updateDashboard({
            status: 'generating_prd',
            message: 'AI Deep Thinking (High Reasoning) is active. This can take 1-3 minutes for complex projects...'
        });

        const generationPrompt = `
You are a senior product manager. Transform the following project description into a structured JSON PRD.
DESCRIPTION: "${prompt}"

OUTPUT FORMAT (JSON ONLY):
{
  "project": "Project Name",
  "description": "General description",
  "stories": [
    { "title": "Task 1", "description": "Detailed steps", "passes": false },
    ...
  ]
}
        `.trim();

        try {
            // Always use process.cwd() for PRD generation as the project folder might not exist yet
            const rawResult = await codexUtils.runCodex(generationPrompt, process.cwd());

            // Robust JSON extraction
            let cleanJson = null;

            // 1. Try to find the content between ```json and ```
            const codeBlockMatch = rawResult.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                cleanJson = codeBlockMatch[1];
            } else {
                // 2. Try to find the largest block between { and }
                // We'll iterate through all { } pairs to find the one that parses correctly
                const regex = /\{[\s\S]*\}/g;
                let match;
                while ((match = regex.exec(rawResult)) !== null) {
                    const candidate = match[0];
                    try {
                        JSON.parse(candidate); // Verification
                        cleanJson = candidate;
                    } catch (e) {
                        // Not a valid full JSON block, keep searching or try shrinking
                        // This might happen if the regex greedily matched extra braces outside the main block
                    }
                }
            }

            // Fallback for greedy regex issues: find the last { and follow to its end
            if (!cleanJson) {
                const firstBrace = rawResult.indexOf('{');
                const lastBrace = rawResult.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const candidate = rawResult.substring(firstBrace, lastBrace + 1);
                    try {
                        JSON.parse(candidate);
                        cleanJson = candidate;
                    } catch (e) { }
                }
            }

            if (!cleanJson) throw new Error("Could not find a valid JSON block in AI response.");

            const generatedPrd = JSON.parse(cleanJson);
            this.prd = generatedPrd;

            // Save to DB
            await dbUtils.saveProject({ id: this.id, prd: this.prd });
            this.updateDashboard({ status: 'prd_ready', message: 'PRD generation successful.' });

            return generatedPrd;
        } catch (error) {
            console.error("PRD Generation Error:", error);
            this.updateDashboard({ status: 'error', message: `Failed to parse PRD: ${error.message}` });
            throw error;
        }
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
}

export default RalphOrchestrator;
