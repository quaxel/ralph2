import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dbUtils from './utils/dbUtils.js';
import RalphOrchestrator from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * RalphServer manages the Express and WebSocket infrastructure.
 */
class RalphServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        this.orchestrators = new Map(); // projectId -> Orchestrator instance

        this.setupExpress();
        this.setupWebSocket();
    }

    setupExpress() {
        const publicPath = path.join(__dirname, '..', 'public');
        this.app.use(express.static(publicPath));
        this.app.use(express.json());

        // API: Get all projects
        this.app.get('/api/projects', (req, res) => {
            res.json(dbUtils.getProjects());
        });

        // API: Create new project
        this.app.post('/api/projects', async (req, res) => {
            const { name, path: projectPath, prd } = req.body;
            const project = { id: name, name, path: projectPath, prd, status: 'created' };
            await dbUtils.saveProject(project);
            res.json(project);
        });

        // API: Control Pipeline
        this.app.post('/api/projects/:id/:action', (req, res) => {
            const { id, action } = req.params;
            const project = dbUtils.getProject(id);

            if (!project) return res.status(404).send('Project not found');

            let orch = this.orchestrators.get(id);
            if (!orch) {
                orch = new RalphOrchestrator(project, (data) => this.broadcast(data));
                this.orchestrators.set(id, orch);
            }

            if (action === 'start') {
                orch.start();
                res.json({ status: 'started' });
            } else if (action === 'stop') {
                orch.stop();
                res.json({ status: 'stopped' });
            } else if (action === 'init') {
                orch.initProject().then(() => res.json({ status: 'initialized' }));
            } else if (action === 'generate-prd') {
                const { prompt } = req.body;
                orch.generatePRD(prompt)
                    .then((prd) => res.json({ status: 'prd_generated', prd }))
                    .catch((err) => res.status(500).json({ status: 'error', message: err.message }));
            } else {
                res.status(400).send('Invalid action');
            }
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            ws.send(JSON.stringify({ type: 'info', message: 'Connected to control center' }));
        });
    }

    /**
     * Broadcasts a message to all connected WebSocket clients.
     * @param {Object} data - The data to broadcast.
     */
    broadcast(data) {
        const message = JSON.stringify(data);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(message);
        });
    }

    start() {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                console.log(`Ralph Dashboard: http://localhost:${this.port}`);
                resolve();
            });
        });
    }
}

export default RalphServer;
