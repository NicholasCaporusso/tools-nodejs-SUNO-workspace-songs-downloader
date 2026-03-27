const express = require('express');
const fs = require('fs');
const path = require('path');
const openurl = require('openurl');

const app = express();
const PORT = process.env.PORT || 3035;

const DATA_DIR = path.join(__dirname, '..', 'data');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');
const SONGS_DIR = path.join(DATA_DIR, 'songs');

app.use(express.static(path.join(__dirname, 'public')));

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
    
    let downloadedSongs = new Set();
    try {
        if (fs.existsSync(audioDir)) {
            const files = fs.readdirSync(audioDir);
            files.forEach(f => {
                const id = f.split('.')[0];
                downloadedSongs.add(id);
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
                songs[key].is_downloaded = downloadedSongs.has(songs[key].id);
            }
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(songs));
        } catch(e) {
            console.error('Error parsing JSON', e);
            res.status(500).json({ error: 'Failed to parse workspace data' });
        }
    });
});

app.get('/api/audio/:workspaceId/:songId', (req, res) => {
    const workspaceId = req.params.workspaceId;
    const songId = req.params.songId;
    const wsDir = path.join(SONGS_DIR, workspaceId);

    fs.readdir(wsDir, (err, files) => {
        if (err) return res.status(404).send('Workspace audio directory not found');
        const songFile = files.find(f => f.startsWith(songId));
        if (!songFile) return res.status(404).send('Audio file not found');
        
        const filePath = path.join(wsDir, songFile);
        res.sendFile(filePath);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    openurl.open(`http://localhost:${PORT}`);
});
