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

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    // openurl.open(`http://localhost:${PORT}`);
});
