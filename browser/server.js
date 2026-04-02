// Run from the project root so all relative .env paths (FOLDER_SESSION, etc.) resolve correctly
process.chdir(require('path').join(__dirname, '..'));
require('dotenv').config({quiet:true})
const express = require('express');
const fs = require('fs');
const path = require('path');
const openurl = require('openurl');

const app = express();
const PORT = process.env.PORT || 3035;

const DATA_DIR = process.env.FOLDER_DATA || path.join(__dirname, '..', 'data');
const WORKSPACES_FILE = process.env.FILE_WORKSPACES || path.join(DATA_DIR, 'workspaces.json');
const WORKSPACES_DIR = process.env.FOLDER_WORKSPACES || path.join(DATA_DIR, 'workspaces');
const SONGS_DIR = process.env.FOLDER_SONGS || path.join(DATA_DIR, 'songs');
const USER_DATA_FILE = path.join(DATA_DIR, 'user_song_data.json');

// Initialize if it doesn't exist
if (!fs.existsSync(USER_DATA_FILE)) {
    const userDir = path.dirname(USER_DATA_FILE);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify({}));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Routes
app.get('/api/workspaces', (req, res) => {
    fs.readFile(WORKSPACES_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read workspaces' });
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    });
});

app.get('/api/workspaces/:id/songs', (req, res) => {
    const wsId = req.params.id;
    const file = path.join(WORKSPACES_DIR, `${wsId}.json`);
    const audioDir = path.join(SONGS_DIR, wsId);
    
    let downloadedSongs = new Map();
    try {
        if (fs.existsSync(audioDir)) {
            const files = fs.readdirSync(audioDir);
            files.forEach(f => {
                const ext = path.extname(f).slice(1);
                const id = path.basename(f, '.' + ext);
                if (ext === 'wav') {
                    downloadedSongs.set(id, 'wav');
                } else if (ext === 'mp3' && downloadedSongs.get(id) !== 'wav') {
                    downloadedSongs.set(id, 'mp3');
                }
            });
        }
    } catch(e) {
        console.error('Failed to read audio directory', e);
    }

    fs.readFile(file, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read workspace data' });
        try {
            const songs = JSON.parse(data);
            for (let key in songs) {
                const songId = songs[key].id;
                songs[key].is_downloaded = downloadedSongs.has(songId);
                songs[key].download_format = downloadedSongs.get(songId);
            }
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(songs));
        } catch(e) {
            console.error('Error parsing JSON', e);
            res.status(500).json({ error: 'Failed to parse workspace data' });
        }
    });
});

app.get('/api/user-data', (req, res) => {
    fs.readFile(USER_DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read user data' });
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    });
});

app.post('/api/user-data/:songId', (req, res) => {
    const songId = req.params.songId;
    const { action, value } = req.body;
    
    fs.readFile(USER_DATA_FILE, 'utf8', (err, data) => {
        let userData = {};
        if (!err && data) {
            try { userData = JSON.parse(data); } catch(e) {}
        }
        
        if (!userData[songId]) {
            userData[songId] = { likeStatus: null, comment: '' };
        }
        
        if (action === 'likeStatus') {
            userData[songId].likeStatus = value;
        } else if (action === 'comment') {
            userData[songId].comment = value;
        }
        
        fs.writeFile(USER_DATA_FILE, JSON.stringify(userData, null, 2), (err) => {
             if (err) return res.status(500).json({ error: 'Failed to save user data' });
             res.json({ success: true, data: userData[songId] });
        });
    });
});

app.get('/api/audio/:workspaceId/:songId', (req, res) => {
    const workspaceId = req.params.workspaceId;
    const songId = req.params.songId;
    const wsDir = path.join(SONGS_DIR, workspaceId);

    fs.readdir(wsDir, (err, files) => {
        if (err) return res.status(404).send('Workspace audio directory not found');
        const wavFile = files.find(f => f === `${songId}.wav`);
        const mp3File = files.find(f => f === `${songId}.mp3`);
        
        const songFile = wavFile || mp3File;
        if (!songFile) return res.status(404).send('Audio file not found');
        
        const filePath = path.join(wsDir, songFile);
        res.sendFile(filePath);
    });
});

app.get('/api/download/:workspaceId/:songId', (req, res) => {
    const workspaceId = req.params.workspaceId;
    const songId = req.params.songId;
    const wsDir = path.join(SONGS_DIR, workspaceId);

    fs.readdir(wsDir, (err, files) => {
        if (err) return res.status(404).send('Workspace audio directory not found');
        const wavFile = files.find(f => f === `${songId}.wav`);
        const mp3File = files.find(f => f === `${songId}.mp3`);
        
        const songFile = wavFile || mp3File;
        if (!songFile) return res.status(404).send('Audio file not found');
        
        const filePath = path.join(wsDir, songFile);
        res.download(filePath, songFile);
    });
});

// ── Job Runner ──────────────────────────────────────────────────────────────
// Downloaders live one level up from the browser folder
const ROOT_DIR = path.join(__dirname, '..');

let jobRunning = false;

// Helper: pipe a downloader call through SSE, capturing console output
function runJob(req, res, label, asyncFn) {
    if (jobRunning) {
        res.status(409).json({ error: 'A job is already running. Please wait.' });
        return;
    }
    jobRunning = true;

    // Disable Nagle buffering so every write() is flushed immediately
    if (req.socket) req.socket.setNoDelay(true);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const send = (msg) => {
        res.write(`data: ${JSON.stringify({ msg })}\n\n`);
        if (res.flush) res.flush();
    };

    // Patch stdout/stderr temporarily
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (chunk, ...args) => { send(String(chunk).trimEnd()); return origStdoutWrite(chunk, ...args); };
    process.stderr.write = (chunk, ...args) => { send('[ERR] ' + String(chunk).trimEnd()); return origStderrWrite(chunk, ...args); };

    send(`▶ ${label}`);
    send('⏳ Launching browser — this may take 15–30 seconds silently…');

    // Heartbeat: SSE comment every 3s keeps connection alive; visible ping every 15s
    let ticks = 0;
    const heartbeat = setInterval(() => {
        try {
            res.write(': keepalive\n\n');
            if (res.flush) res.flush();
            ticks++;
            if (ticks % 5 === 0) send('⏳ Still running…');
        } catch(e) { clearInterval(heartbeat); }
    }, 3000);

    asyncFn()
        .then(() => { send('✅ Done.'); })
        .catch((err) => { send('❌ Error: ' + (err.message || String(err))); })
        .finally(() => {
            clearInterval(heartbeat);
            process.stdout.write = origStdoutWrite;
            process.stderr.write = origStderrWrite;
            jobRunning = false;
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });
}

// POST /api/jobs/scrape-workspaces
app.post('/api/jobs/scrape-workspaces', (req, res) => {
    const { downloadWorkspacesIndex } = require(path.join(ROOT_DIR, 'downloader-01-workspaces-index.js'));
    runJob(req, res, 'Scraping workspaces index…', () => downloadWorkspacesIndex());
});

// POST /api/jobs/scrape-workspace-songs/:workspaceId
app.post('/api/jobs/scrape-workspace-songs/:workspaceId', (req, res) => {
    const wsId = req.params.workspaceId;
    const { downloadWorkspacesIndex } = require(path.join(ROOT_DIR, 'downloader-01-workspaces-index.js'));
    const { downloadWorkspacesDetail } = require(path.join(ROOT_DIR, 'downloader-02-workspaces-detail.js'));

    runJob(req, res, `Scraping songs for workspace ${wsId}…`, async () => {
        // Step 1 – refresh workspace index so clip_count etc. are up to date
        console.log('── Step 1/2: Refreshing workspace index…');
        await downloadWorkspacesIndex();

        // Step 2 – fetch songs for the specific workspace
        const workspacesRaw = fs.existsSync(WORKSPACES_FILE) ? JSON.parse(fs.readFileSync(WORKSPACES_FILE, 'utf8')) : {};
        const workspace = workspacesRaw[wsId];
        if (!workspace) throw new Error(`Workspace '${wsId}' not found after index refresh.`);
        console.log(`── Step 2/2: Scraping songs for "${workspace.name || wsId}"…`);
        await downloadWorkspacesDetail(workspace);
    });
});


// POST /api/jobs/download-mp3/:workspaceId
app.post('/api/jobs/download-mp3/:workspaceId', (req, res) => {
    const wsId = req.params.workspaceId;
    const { downloadWorkspaceSongs } = require(path.join(ROOT_DIR, 'downloader-03-songs-MP3.js'));
    runJob(req, res, `Downloading MP3s for workspace ${wsId}…`, () => downloadWorkspaceSongs(`${wsId}.json`));
});

// POST /api/jobs/download-wav/:workspaceId
app.post('/api/jobs/download-wav/:workspaceId', (req, res) => {
    const wsId = req.params.workspaceId;
    const { downloadWorkspaceSongs } = require(path.join(ROOT_DIR, 'downloader-03-songs-WAV.js'));
    runJob(req, res, `Downloading WAVs for workspace ${wsId}…`, () => downloadWorkspaceSongs(`${wsId}.json`));
});

// POST /api/jobs/save-songs/:workspaceId
app.post('/api/jobs/save-songs/:workspaceId', (req, res) => {
    const wsId = req.params.workspaceId;
    const { targetPath, filter, naming } = req.body;
    
    console.log(`[save-songs] body received:`, req.body);
    
    runJob(req, res, `Saving ${filter} songs to ${targetPath}…`, async () => {
        if (!targetPath) throw new Error('Target path is required');
        
        const wsDir = path.join(SONGS_DIR, wsId);
        
        if (!fs.existsSync(wsDir)) {
            throw new Error('Workspace audio directory not found');
        }
        
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        
        let userData = {};
        if (fs.existsSync(USER_DATA_FILE)) {
            try { userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8')); } catch(e) {}
        }
        
        let wsData = {};
        console.log(`[save-songs] naming mode: ${naming}, wsId: ${wsId}`);
        if (naming === 'title') {
            const wsDataPath = path.join(WORKSPACES_DIR, `${wsId}.json`);
            console.log(`[save-songs] checking workspace data path: ${wsDataPath}`);
            if (fs.existsSync(wsDataPath)) {
                try {
                    wsData = JSON.parse(fs.readFileSync(wsDataPath, 'utf8'));
                    console.log(`[save-songs] successfully loaded workspace data for ${wsId}, found ${Object.keys(wsData).length} songs.`);
                } catch(e) {
                    console.error('[save-songs] Error parsing workspace data:', e);
                }
            } else {
                console.log(`[save-songs] workspace data file not found: ${wsDataPath}`);
            }
        }
        
        const files = fs.readdirSync(wsDir);
        let copied = 0;
        
        console.log(`Scanning ${files.length} downloaded files in workspace...`);
        for (const file of files) {
            const ext = path.extname(file);
            if (ext !== '.mp3' && ext !== '.wav') continue;
            
            const songId = path.basename(file, ext);
            
            if (filter === 'liked') {
                if (!userData[songId] || userData[songId].likeStatus !== 'liked') {
                    continue;
                }
            }
            
            const src = path.join(wsDir, file);
            let dstFileName = file;
            
            if (naming === 'title') {
                if (wsData[songId]) {
                    console.log(`[save-songs] Found song data for ${songId}: title="${wsData[songId].title}"`);
                    if (wsData[songId].title) {
                        const safeTitle = String(wsData[songId].title).replace(/[\\/:*?"<>|]/g, '').trim() || 'Unknown Title';
                        dstFileName = `${safeTitle} - ${file}`;
                        console.log(`[save-songs] Renaming to ${dstFileName}`);
                    }
                } else {
                    console.log(`[save-songs] No song data found for ${songId} in workspace ${wsId}`);
                }
            }
            
            const dst = path.join(targetPath, dstFileName);
            
            fs.copyFileSync(src, dst);
            copied++;
        }
        
        console.log(`Successfully saved ${copied} ${filter === 'liked' ? 'liked ' : ''}song files to ${targetPath}.`);
    });
});

// GET /api/jobs/status
app.get('/api/jobs/status', (req, res) => {
    res.json({ running: jobRunning });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    openurl.open(`http://localhost:${PORT}`);
});
