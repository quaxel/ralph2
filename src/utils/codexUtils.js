import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * Executes a prompt directly via OpenAI-compatible API (LM Studio or OpenAI).
 * This replaces codex-cli and handles file writing manually.
 * 
 * @param {string} prompt - The prompt to send to the AI.
 * @param {string} workingDir - The directory where files should be written.
 * @param {string} role - The role of the agent (DEVELOPER or REVIEWER).
 * @returns {Promise<string>} - The AI's response text.
 */
export async function runCodex(prompt, workingDir, role = 'DEVELOPER') {
    const provider = process.env.CODEX_PROVIDER || 'openai';
    const model = process.env.CODEX_MODEL || 'gpt-4o';
    const apiKey = process.env.OPENAI_API_KEY || 'no-key-required';

    let baseUrl = 'https://api.openai.com/v1/chat/completions';
    if (provider === 'lmstudio') {
        baseUrl = process.env.LMSTUDIO_API_BASE || 'http://localhost:1234/v1/chat/completions';
    } else if (provider === 'ollama') {
        baseUrl = process.env.OLLAMA_API_BASE || 'http://localhost:11434/v1/chat/completions';
    }

    // Role-specific instructions
    let instruction = '';
    if (role === 'REVIEWER') {
        instruction = `
INSTRUCTION FOR REVIEWER:
1. Analyze the work done by the developer.
2. If it meets all criteria, YOU MUST START YOUR RESPONSE WITH: REVIEW_PASSED
3. If there are issues, provide specific feedback. 
4. If you want to fix something yourself, use the format: ### FILE: path/to/file [newline] \`\`\` [content] \`\`\``.trim();
    } else if (role === 'PRD' || role === 'JSON') {
        instruction = `
INSTRUCTION FOR ${role} GENERATION:
1. Output ONLY the JSON object.
2. Do not include any conversational text or markdown formatting outside the JSON.`.trim();
    } else {
        instruction = `
CRITICAL INSTRUCTION FOR FILE EDITS:
You must use the following format for ANY file you want to create or modify:

### FILE: filename_relative_to_project_root
\`\`\`
[FULL FILE CONTENT]
\`\`\`

1. Always provide the COMPLETE content of the file.
2. Do not use placeholders like // ... existing code ...
3. You MUST update 'progress.txt' with 'PROMISE_MET' when finished using the same format above.`.trim();
    }

    const enrichedPrompt = `${prompt}\n\n${instruction}`;

    console.log(`[DirectAPI] Requesting ${provider}/${model} as ${role}...`);

    try {
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: enrichedPrompt }],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const result = data.choices[0].message.content;

        console.log(`[DirectAPI] Parsing response...`);

        // regex to catch ### FILE: path followed by code block
        const fileRegex = /### FILE: (.*?)\n+```.*?\n([\s\S]*?)```/g;
        let match;
        let filesUpdated = [];

        while ((match = fileRegex.exec(result)) !== null) {
            const filePath = match[1].trim();
            const content = match[2];
            const absolutePath = path.resolve(workingDir, filePath);

            // Safety Check: Prevent path traversal
            if (!absolutePath.startsWith(path.resolve(workingDir))) {
                console.warn(`[DirectAPI] Path Traversal attempted: ${filePath}`);
                continue;
            }

            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            fs.writeFileSync(absolutePath, content);
            filesUpdated.push(filePath);
        }

        if (filesUpdated.length > 0) {
            console.log(`[DirectAPI] ✅ Applied changes: ${filesUpdated.join(', ')}`);
        } else {
            console.log(`[DirectAPI] ℹ️ No file changes detected.`);
        }

        return result;
    } catch (error) {
        console.error(`[DirectAPI Error]`, error.message);
        return `[ERROR] ${error.message}`;
    }
}

export async function checkCodexAvailability() {
    return { available: true, command: 'Direct API Runner' };
}
