'use strict'
require('dotenv').config({quiet:true})

const fs = require('fs')
const path = require('path')

// Load environment variables for paths
const FOLDER_DATA = process.env.FOLDER_DATA
const FOLDER_WORKSPACES = process.env.FOLDER_WORKSPACES
const FOLDER_SONGS = process.env.FOLDER_SONGS
const FILE_WORKSPACES = process.env.FILE_WORKSPACES

// 1. Import all downloader scripts
const { downloadWorkspacesIndex } = require('./downloader-01-workspaces-index.js')
const { downloadWorkspacesDetail } = require('./downloader-02-workspaces-detail.js')
const DownloaderWAV = require('./downloader-03-songs-WAV.js')

async function syncAll() {
    console.log("Starting full sync...");
    
    // Ensure essential folders exist
    if (!fs.existsSync(FOLDER_WORKSPACES)) fs.mkdirSync(FOLDER_WORKSPACES, { recursive: true })
    if (!fs.existsSync(FOLDER_SONGS)) fs.mkdirSync(FOLDER_SONGS, { recursive: true })
    
    // 2. Download the workspace index
    console.log("Downloading workspace index...");
    await downloadWorkspacesIndex();
    
    const workspaces = fs.existsSync(FILE_WORKSPACES) ? JSON.parse(fs.readFileSync(FILE_WORKSPACES, 'utf8')) : {};
    
    const workspaceItems = Object.values(workspaces);
    console.log(`Found ${workspaceItems.length} workspaces.`);
    
    // 3. For each workspace, check clip count and update if necessary
    for (const workspace of workspaceItems) {
		if(workspace.id=='default') continue
        let needsUpdate = false;
        const wsFile = path.join(FOLDER_WORKSPACES, `${workspace.id}.json`);
        
        if (!fs.existsSync(wsFile)) {
            needsUpdate = true;
        } else {
            try {
                const songs = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
                if (Object.keys(songs).length !== workspace.clip_count) {
                    needsUpdate = true;
                }
            } catch (e) {
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            console.log(`Workspace ${workspace.id} (${workspace.name}) needs update. Expected ${workspace.clip_count} clips.`);
            await downloadWorkspacesDetail(workspace);
        } else {
            console.log(`Workspace ${workspace.id} (${workspace.name}) is up to date.`);
        }
    }
    
    // 4. For each workspace, download MP3 and WAV
    for (const workspace of workspaceItems) {
		if(workspace.id=='default') continue
        const wsFilename = `${workspace.id}.json`;
        const wsFile = path.join(FOLDER_WORKSPACES, wsFilename);
        if (!fs.existsSync(wsFile)) continue;
        
        console.log(`Downloading WAVs for workspace ${workspace.id} (${workspace.name})...`);
        await DownloaderWAV.downloadWorkspaceSongs(wsFilename, true);
    }
    
    // 5. Clean up data folder: remove MP3 if WAV exists
    console.log("Cleaning up redundant MP3 files...");
    if (fs.existsSync(FOLDER_SONGS)) {
        const wsFolders = fs.readdirSync(FOLDER_SONGS);
        let removedCount = 0;
        
        for (const wsFolder of wsFolders) {
            const wsPath = path.join(FOLDER_SONGS, wsFolder);
            if (fs.statSync(wsPath).isDirectory()) {
                const files = fs.readdirSync(wsPath);
                
                for (const file of files) {
                    if (file.endsWith('.wav')) {
                        const baseName = path.basename(file, '.wav');
                        const mp3Path = path.join(wsPath, `${baseName}.mp3`);
                        
                        if (fs.existsSync(mp3Path)) {
                            fs.unlinkSync(mp3Path);
                            removedCount++;
                            console.log(`Removed redundant MP3: ${mp3Path}`);
                        }
                    }
                }
            }
        }
        console.log(`Cleanup complete. Removed ${removedCount} MP3 files.`);
    }
    
    console.log("Full sync completed.");
}

// Enable executing as standalone
if (require.main === module) {
    syncAll().catch(err => {
        console.error("Error during full sync:", err);
        process.exit(1);
    });
}

// Enable importing into the server application
module.exports = { syncAll };
