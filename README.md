# SUNO Downloader and Workspace Browser

> [!WARNING]
> **Important Note:** This script heavily depends on how the content is organized on SUNO and its internal APIs. If things change on SUNO's end, the script will stop working. If you encounter issues, please submit an issue on the repository!

A complete toolkit for downloading your SUNO workspaces, songs, and metadata to your local machine, alongside a beautifully designed web interface to browse and play them.

## Requirements

1. **HeyBro**: The downloading scripts require installing and running the [HeyBro](https://github.com/NicholasCaporusso/HeyBro) system.
2. **Authentication**: Users **must be logged into Suno** to download their data. Please refer to the HeyBro documentation for specific instructions on how to log in properly to capture your session data.
3. **Node.js**: Ensure you have Node.js installed to execute the downloader scripts and host the Express application.

---

## 🚀 How to Download Your Data

The project includes three sequential Node.js scripts that fetch your data directly from SUNO and structure it locally. Run them in the following order:

1. **`node downloader-01-workspaces-index.js`**
   - Fetches the index and metadata of all your SUNO Workspaces.
   - Saves the output to `data/workspaces.json`.

2. **`node downloader-02-workspaces-detail.js`**
   - Iterates through the workspaces index and fetches the corresponding details and songs inside each one.
   - Saves the song information payload for each workspace as a JSON file in the `data/workspaces/` directory.

3. **`node downloader-03-songs-WAV.js`**
   - Scans the downloaded song payloads and downloads the actual `.wav` audio files via browser automation.
   - Saves the audio files into workspace-specific subfolders in the `data/songs/` directory.

4. **`node downloader-03-songs-MP3.js` (Recommended)**
   - *Although the above script enables downloading WAV files, it is **highly recommended** to use this MP3 script instead to avoid overwhelming SUNO with requests!*
   - Downloads the `.mp3` file directly utilizing the CDN link securely stored in the JSON payload, bypassing the UI.

---

## 📁 Data Structure

After running all the downloading scripts, your `data/` folder will be structured like this:

```text
data/
├── workspaces.json                # Master list of all workspaces and their metadata
├── workspaces/                    # Detailed metadata/JSON payloads for songs
│   ├── default.json               # (Songs that aren't assigned to specific custom workspaces)
│   ├── <workspace-id>.json        
│   └── ...
└── songs/                         # Downloaded audio media (.wav files)
    ├── default/                   
    │   ├── <song-id>.wav
    │   └── ...
    ├── <workspace-id>/            
    │   ├── <song-id>.wav
    │   └── ...
```

---

## 🖥 The Interface (UI)

We provide a fast, modern NodeJS + Express single-page application (SPA) to browse and play your downloaded songs locally.

### Features
- **Workspace Navigation**: Browse all your workspaces in the left sidebar, sorted alphabetically with the default workspace pinned to the top.
- **Search & Filter**: Instantly filter your songs by typing titles, lyrics, or tags into the top search bar.
- **Interactive Song Cards**: Song cards feature duration badges, Instrumental/Lyrics indicators, and an interactive play/stop button. 
- **Offline Playback**: Stream your downloaded local `.wav` files directly from your disk to your browser. Playbuttons for songs that have not yet been downloaded are automatically disabled.
- **Details Panel**: Click on any song card to open a right-side panel displaying complete lyrics/prompts, tags, play counts, and timestamps.
- **SUNO Integration**: Link back to specific songs (`suno.com/song/...`) and workspaces (`suno.com/create?wid=...`) directly on the live SUNO site.

### How to Run the Interface

1. Navigate to the `browser` folder:
   ```bash
   cd browser
   ```
2. Install the necessary dependencies (Express and OpenURL):
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node server.js
   ```
   
The local server will start and automatically open your default web browser to `http://localhost:3035`. Enjoy!
