import { Telegraf, Markup } from 'telegraf';
import * as dbUtils from './dbUtils.js';

class TelegramManager {
    constructor() {
        this.bot = null;
        this.settings = null;
        this.approvalPromise = null;
        this.approvalResolve = null;
        this.server = null; // Reference to RalphServer
        this.userState = new Map(); // chatId -> { step, projectName, projectPrompt }
    }

    setServer(server) {
        this.server = server;
    }

    init() {
        const globalSettings = dbUtils.getSettings();
        this.settings = globalSettings.telegramSettings;

        if (this.settings && this.settings.enabled && this.settings.botToken) {
            try {
                this.bot = new Telegraf(this.settings.botToken);

                this.bot.command('start', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;
                    ctx.reply("👋 *Welcome to Ralph AR Commander!*\n\nUse /help to see available commands.", { parse_mode: 'Markdown' });
                });

                this.bot.command('help', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;
                    const helpMsg = `
🤖 *Ralph AR - Command List*

/new - Create a new project.
/status - Overall system health.
/current - View currently running project.
/projects - List all projects.
/help - Show this help menu.

*Mobile Review:*
On task completion, I'll send you *Approve/Reject* buttons.
`.trim();
                    ctx.reply(helpMsg, { parse_mode: 'Markdown' });
                });

                this.bot.command('status', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;
                    ctx.reply("🟢 *Ralph AR Systems: ONLINE*\nMemory: Stable\nOrchestrator: Active\nCodex Connection: Verified", { parse_mode: 'Markdown' });
                });

                this.bot.command('new', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;

                    const args = ctx.message.text.split(' ').slice(1);
                    if (args.length > 0) {
                        const projectName = args.join('_');
                        this.userState.set(ctx.from.id, { step: 'AWAITING_PROMPT', projectName });
                        ctx.reply(`🏗 *Project:* \`${projectName}\`\n\nWhat would you like to build? Please enter the project prompt:`, { parse_mode: 'Markdown' });
                    } else {
                        this.userState.set(ctx.from.id, { step: 'AWAITING_NAME' });
                        ctx.reply("📝 What should be the **name** of the new project?", { parse_mode: 'Markdown' });
                    }
                });

                this.bot.command('current', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;

                    const projects = dbUtils.getProjects();
                    const activeP = projects.find(p => p.status === 'running');

                    if (!activeP) {
                        return ctx.reply("❌ *No projects are currently running.*", { parse_mode: 'Markdown' });
                    }

                    const activeStage = (activeP.prd.stages || []).find(s => !s.isCompleted);
                    const activeStory = (activeStage?.stories || []).find(st => !st.passes && !st.isSkipped);

                    const detailMsg = `
🚀 *Current Project: ${activeP.name}*

📍 *Stage:* ${activeStage ? activeStage.name : 'N/A'}
📝 *Task:* ${activeStory ? activeStory.title : 'N/A'}
🔢 *Iteration:* ${activeP.iteration || 0}
📱 *Human Review:* ${activeP.useHumanReview ? 'ENABLED' : 'DISABLED'}

*Mission:* ${activeStage ? activeStage.mission : 'No mission set.'}
`.trim();
                    ctx.reply(detailMsg, { parse_mode: 'Markdown' });
                });

                this.bot.command('projects', (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;
                    const projects = dbUtils.getProjects();
                    if (projects.length === 0) {
                        return ctx.reply("No projects found in the database.");
                    }
                    const list = projects.map(p => {
                        const statusIcon = p.status === 'running' ? '🚀' : (p.status === 'completed' ? '✅' : '💤');
                        return `${statusIcon} *${p.name}* - ${p.status}`;
                    }).join('\n');
                    ctx.reply(`📂 *Project Directory:*\n\n${list}`, { parse_mode: 'Markdown' });
                });

                // Generic text handler for state machine
                this.bot.on('text', async (ctx) => {
                    if (ctx.from.id.toString() !== this.settings.chatId) return;
                    if (ctx.message.text.startsWith('/')) return;

                    const state = this.userState.get(ctx.from.id);
                    if (!state) return;

                    if (state.step === 'AWAITING_NAME') {
                        const projectName = ctx.message.text.trim().replace(/\s+/g, '_');
                        state.projectName = projectName;
                        state.step = 'AWAITING_PROMPT';
                        ctx.reply(`🏗 *Project:* \`${projectName}\`\n\nWhat would you like to build? Please enter the project prompt:`, { parse_mode: 'Markdown' });
                    }
                    else if (state.step === 'AWAITING_PROMPT') {
                        const prompt = ctx.message.text.trim();
                        const projectName = state.projectName;

                        this.userState.delete(ctx.from.id); // Clear state

                        ctx.reply(`🚀 *Starting Creation...*\nProject: \`${projectName}\`\n_Analyzing prompt and generating plan..._`, { parse_mode: 'Markdown' });

                        // Run in background to avoid Telegram handler timeout
                        (async () => {
                            try {
                                if (!this.server) {
                                    throw new Error("Ralph Server not linked to Telegram Manager.");
                                }
                                await this.server.createNewProject(projectName, prompt);
                                ctx.reply(`✅ *Project Initialized!*\nDevelopment for \`${projectName}\` has started. I will notify you of progress.`, { parse_mode: 'Markdown' });
                            } catch (error) {
                                console.error("[Telegram] Project Creation Error:", error);
                                ctx.reply(`❌ *Error creating project \`${projectName}\`:* ${error.message}`, { parse_mode: 'Markdown' });
                            }
                        })();
                    }
                });

                this.bot.action('approve_task', (ctx) => {
                    ctx.answerCbQuery("Task Approved!");
                    ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n✅ APPROVED BY USER via Mobile.");
                    if (this.approvalResolve) this.approvalResolve(true);
                });

                this.bot.action('reject_task', (ctx) => {
                    ctx.answerCbQuery("Task Rejected!");
                    ctx.editMessageText(ctx.callbackQuery.message.text + "\n\n❌ REJECTED BY USER via Mobile.");
                    if (this.approvalResolve) this.approvalResolve(false);
                });

                this.bot.launch();
                console.log("[Telegram] Bot initialized and launched.");
            } catch (error) {
                console.error("[Telegram] Init Error:", error.message);
            }
        }
    }

    async reInit() {
        this.stop();
        this.init();
    }

    async sendMessage(message) {
        if (!this.bot || !this.settings.chatId) return;
        try {
            await this.bot.telegram.sendMessage(this.settings.chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("[Telegram] Send Message Error:", error.message);
        }
    }

    async askForApproval(stageName, taskTitle) {
        if (!this.bot || !this.settings.chatId) return true; // Auto-pass if no bot configured

        const message = `🚨 *HUMAN REVIEW REQUIRED*\n\n*Stage:* ${stageName}\n*Task:* ${taskTitle}\n\nRalph has finished the work. Do you approve?`;

        try {
            await this.bot.telegram.sendMessage(this.settings.chatId, message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('✅ Approve', 'approve_task'),
                    Markup.button.callback('❌ Reject', 'reject_task')
                ])
            });

            return new Promise((resolve) => {
                this.approvalResolve = resolve;
            });
        } catch (error) {
            console.error("[Telegram] Ask for Approval Error:", error.message);
            return true;
        }
    }

    stop() {
        if (this.bot) {
            this.bot.stop();
            console.log("[Telegram] Bot stopped.");
        }
    }
}

export const telegramManager = new TelegramManager();
