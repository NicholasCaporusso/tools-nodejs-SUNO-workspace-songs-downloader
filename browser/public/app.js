let workspacesData = {};
let currentWorkspaceId = null;
let currentSongsMap = new Map();
let currentPlayingSongId = null;
let userSongData = {};
let currentSort = 'date'; // 'date' | 'title' | 'like'

// Elements
const workspaceListEl = document.getElementById('workspace-list');
const songListEl = document.getElementById('song-list');
const searchInput = document.getElementById('search-input');
const searchContainer = document.getElementById('search-container');
const sortContainer = document.getElementById('sort-container');
const workspaceActions = document.getElementById('workspace-actions');
const currentWsNameEl = document.getElementById('current-workspace-name');
const sunoWsLink = document.getElementById('suno-workspace-link');
const songDetailsPanel = document.getElementById('song-details-panel');
const audioPlayerContainer = document.getElementById('audio-player-container');
const waveformPlayBtn = document.getElementById('waveform-play-btn');
const waveformCurrentEl = document.getElementById('waveform-current');
const waveformDurationEl = document.getElementById('waveform-duration');
const nowPlayingImg = document.getElementById('now-playing-img');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingTags = document.getElementById('now-playing-tags');

// Job modal elements
const jobModal = document.getElementById('job-modal');
const jobModalTitle = document.getElementById('job-modal-title');
const jobModalClose = document.getElementById('job-modal-close');
const jobLog = document.getElementById('job-log');

jobModalClose.addEventListener('click', () => jobModal.classList.add('hidden'));


// ── WaveSurfer ─────────────────────────────────────────────────────────────
const wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#93c5fd',
    progressColor: '#2563eb',
    cursorColor: '#1d4ed8',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 48,
    normalize: true,
    backend: 'MediaElement',
});

const playIconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const pauseIconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

wavesurfer.on('ready', () => {
    waveformDurationEl.textContent = formatTime(wavesurfer.getDuration());
    wavesurfer.play();
});

wavesurfer.on('audioprocess', () => {
    waveformCurrentEl.textContent = formatTime(wavesurfer.getCurrentTime());
});

wavesurfer.on('play', () => {
    waveformPlayBtn.innerHTML = pauseIconSVG;
    renderSongs(searchInput.value);
});

wavesurfer.on('pause', () => {
    waveformPlayBtn.innerHTML = playIconSVG;
    renderSongs(searchInput.value);
});

wavesurfer.on('finish', () => {
    waveformPlayBtn.innerHTML = playIconSVG;
    waveformCurrentEl.textContent = '0:00';
    renderSongs(searchInput.value);
});

waveformPlayBtn.addEventListener('click', () => {
    wavesurfer.playPause();
});

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
    try {
        const [wsRes, userRes] = await Promise.all([
            fetch('/api/workspaces'),
            fetch('/api/user-data')
        ]);
        workspacesData = await wsRes.json();
        userSongData = await userRes.json();
        renderWorkspaces();
    } catch (err) {
        console.error('Failed to load workspaces or user data', err);
        workspaceListEl.innerHTML = '<li class="loading">Error loading data.</li>';
    }
}

// ── Workspaces ─────────────────────────────────────────────────────────────
function renderWorkspaces() {
    workspaceListEl.innerHTML = '';
    
    const entries = Object.entries(workspacesData);
    entries.sort((a, b) => {
        if (a[0] === 'default') return -1;
        if (b[0] === 'default') return 1;
        const nameA = (a[1].name || a[0]).toLowerCase();
        const nameB = (b[1].name || b[0]).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    entries.forEach(([id, ws]) => {
        const li = document.createElement('li');
        li.className = 'workspace-item';
        if (id === currentWorkspaceId) li.classList.add('active');
        
        li.innerHTML = `
            <div class="workspace-title">${ws.name || id}</div>
            <div class="workspace-meta">${ws.clip_count} clips</div>
        `;
        
        li.addEventListener('click', () => {
            document.querySelectorAll('.workspace-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            selectWorkspace(id);
        });
        
        workspaceListEl.appendChild(li);
    });
}

async function selectWorkspace(id) {
    currentWorkspaceId = id;
    const ws = workspacesData[id];
    currentWsNameEl.textContent = ws.name || id;
    
    if (id !== 'default') {
        sunoWsLink.href = `https://suno.com/create?wid=${id}`;
        sunoWsLink.classList.remove('hidden');
    } else {
        sunoWsLink.classList.add('hidden');
    }
    
    searchContainer.classList.remove('hidden');
    sortContainer.classList.remove('hidden');
    workspaceActions.classList.remove('hidden');
    songListEl.innerHTML = '<li class="empty-state" style="grid-column: 1 / -1; width: 100%;">Loading songs...</li>';
    songDetailsPanel.classList.add('hidden');
    
    try {
        const res = await fetch(`/api/workspaces/${id}/songs`);
        const data = await res.json();
        
        currentSongsMap.clear();
        Object.values(data).forEach(song => {
            currentSongsMap.set(song.id, song);
        });
        
        renderSongs();
    } catch (err) {
        console.error('Failed to load songs', err);
        songListEl.innerHTML = '<li class="empty-state" style="grid-column: 1 / -1; width: 100%;">Error loading songs.</li>';
    }
}

// ── Sort ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        renderSongs(searchInput.value);
    });
});

function sortSongs(songs) {
    return [...songs].sort((a, b) => {
        if (currentSort === 'title') {
            return (a.title || '').localeCompare(b.title || '');
        }
        if (currentSort === 'like') {
            const la = (userSongData[a.id] && userSongData[a.id].likeStatus === 'liked') ? 0 : 1;
            const lb = (userSongData[b.id] && userSongData[b.id].likeStatus === 'liked') ? 0 : 1;
            if (la !== lb) return la - lb;
            // secondary: date
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        }
        // default: date desc
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

// ── Songs ──────────────────────────────────────────────────────────────────
function renderSongs(filter = '') {
    songListEl.innerHTML = '';
    
    const songs = Array.from(currentSongsMap.values());
    const filtered = filter ? songs.filter(s => {
        const q = filter.toLowerCase();
        return (s.title && s.title.toLowerCase().includes(q)) || 
               (s.metadata && s.metadata.tags && s.metadata.tags.toLowerCase().includes(q)) ||
               (s.metadata && s.metadata.prompt && s.metadata.prompt.toLowerCase().includes(q));
    }) : songs;
    
    if (filtered.length === 0) {
        songListEl.innerHTML = '<li class="empty-state" style="grid-column: 1 / -1; width: 100%;">No songs found.</li>';
        return;
    }
    
    const sorted = sortSongs(filtered);
    
    sorted.forEach(song => {
        const li = document.createElement('li');
        li.className = 'song-card';
        if (currentPlayingSongId === song.id) li.classList.add('active');
        
        const tags = song.metadata && song.metadata.tags ? song.metadata.tags : 'No tags';
        const imgUrl = song.image_url || 'https://cdn1.suno.ai/defaultBlue.webp';
        
        const d = (song.duration || (song.metadata && song.metadata.duration));
        const duration = d ? `${Math.floor(d/60)}:${Math.floor(d%60).toString().padStart(2, '0')}` : `--:--`;
        
        const typeBadge = (song.has_vocal || (song.metadata && song.metadata.has_vocal)) 
            ? '<span class="badge badge-vocals">🎤 Lyrics</span>' 
            : '<span class="badge badge-instrumental">🎵 Instrumental</span>';
            
        let formatBadge = '';
        if (song.is_downloaded && song.download_format) {
            const fmt = song.download_format.toUpperCase();
            formatBadge = `<span class="badge badge-format badge-format-${fmt.toLowerCase()}">${fmt}</span>`;
        }
        
        const userData = userSongData[song.id] || { likeStatus: null, comment: '' };
        const likeActive = userData.likeStatus === 'liked' ? 'active-like' : '';
        const dislikeActive = userData.likeStatus === 'disliked' ? 'active-dislike' : '';
        
        const downloadHref = song.is_downloaded ? `/api/download/${currentWorkspaceId}/${song.id}` : '#';
        const downloadClass = song.is_downloaded ? '' : 'disabled';
        
        const isPlaying = (currentPlayingSongId === song.id && wavesurfer.isPlaying());
        const playIcon = isPlaying ? '⏹' : '▶';

        li.innerHTML = `
            <div class="card-image-wrapper">
                <a href="https://suno.com/song/${song.id}" target="_blank" class="card-suno-btn" title="View on SUNO">↗ SUNO</a>
                <img class="song-img" src="${imgUrl}" alt="Song art" loading="lazy">
                ${typeBadge}
                ${formatBadge}
                <span class="badge badge-duration">${duration}</span>
                <button class="card-play-btn ${song.is_downloaded ? '' : 'disabled'}" data-id="${song.id}" title="${song.is_downloaded ? 'Play/Stop' : 'Not downloaded'}">
                    ${playIcon}
                </button>
            </div>
            <div class="song-info">
                <h3>${song.title || 'Untitled'}</h3>
                <div class="song-meta">${tags}</div>
                <div class="card-footer-meta">
                    <span class="plays-count">${song.play_count || 0} plays</span>
                    <div class="card-actions">
                        <button class="icon-btn like-btn ${likeActive}" data-id="${song.id}" title="Like">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                        </button>
                        <button class="icon-btn dislike-btn ${dislikeActive}" data-id="${song.id}" title="Dislike">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"></path></svg>
                        </button>
                        <a href="${downloadHref}" class="icon-btn download-btn ${downloadClass}" title="Download" data-id="${song.id}" ${song.is_downloaded ? 'download' : ''}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </a>
                    </div>
                </div>
            </div>
        `;
        
        // click on card body to view details
        li.querySelector('.song-info').addEventListener('click', (e) => {
             showSongDetails(song);
        });
        
        li.querySelector('.card-image-wrapper').addEventListener('click', (e) => {
            if (!e.target.closest('.card-play-btn') && !e.target.closest('.card-suno-btn')) {
                showSongDetails(song);
            }
        });

        // click on card action buttons
        const likeBtn = li.querySelector('.like-btn');
        const dislikeBtn = li.querySelector('.dislike-btn');
        const downloadBtn = li.querySelector('.download-btn');
        
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeStatus(song.id, 'liked');
        });
        
        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeStatus(song.id, 'disliked');
        });
        
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!song.is_downloaded) e.preventDefault();
        });

        // click on play button
        li.querySelector('.card-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (!song.is_downloaded) return;
            playSong(song);
        });
        
        songListEl.appendChild(li);
    });
}

// ── Song Details ───────────────────────────────────────────────────────────
function showSongDetails(song) {
    document.querySelectorAll('.song-card').forEach(el => el.classList.remove('active'));
    
    songDetailsPanel.classList.remove('hidden');
    
    const tags = song.metadata && song.metadata.tags ? song.metadata.tags : '';
    const imgUrl = song.image_large_url || song.image_url || 'https://cdn1.suno.ai/defaultBlue.webp';
    const lyrics = song.metadata && song.metadata.prompt ? song.metadata.prompt : 'No lyrics available.';
    
    const userData = userSongData[song.id] || { likeStatus: null, comment: '' };
    const likeActive = userData.likeStatus === 'liked' ? 'active-like' : '';
    const dislikeActive = userData.likeStatus === 'disliked' ? 'active-dislike' : '';
    
    const downloadHref = song.is_downloaded ? `/api/download/${currentWorkspaceId}/${song.id}` : '#';
    const downloadClass = song.is_downloaded ? '' : 'disabled';
    const downloadText = song.is_downloaded ? '⬇ Download' : 'Not Downloaded';
    
    songDetailsPanel.innerHTML = `
        <div class="details-header">
            <img src="${imgUrl}" alt="Cover">
            <h2>${song.title || 'Untitled'}</h2>
            <div class="details-meta">${song.created_at ? 'Created: ' + new Date(song.created_at).toLocaleString() : ''}</div>
            <a href="https://suno.com/song/${song.id}" target="_blank" class="suno-link" style="display:block; margin-bottom: 15px;">View on SUNO ↗</a>
            
            <div class="interaction-bar">
                <button class="action-btn like-btn ${likeActive}" data-id="${song.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg> Like
                </button>
                <button class="action-btn dislike-btn ${dislikeActive}" data-id="${song.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"></path></svg> Dislike
                </button>
                <a href="${downloadHref}" class="action-btn download-btn action-download ${downloadClass}" data-id="${song.id}" ${song.is_downloaded ? 'download' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> ${downloadText}
                </a>
            </div>

            <button class="play-btn ${song.is_downloaded ? '' : 'disabled'}" id="play-btn-${song.id}" ${song.is_downloaded ? '' : 'disabled'}>
                ${song.is_downloaded ? 'Play Song' : 'Not Downloaded'}
            </button>
        </div>
        ${tags ? `<div class="tags-container"><span class="tag">${tags}</span></div>` : ''}
        <div class="lyrics-container">
            <h3>Lyrics / Prompt</h3>
            <div class="lyrics">${lyrics}</div>
        </div>
        <div class="comment-section">
            <h3>Notes / Comments</h3>
            <textarea class="comment-input" id="comment-input-${song.id}" placeholder="Write a comment...">${userData.comment || ''}</textarea>
            <button class="comment-save-btn" id="comment-save-${song.id}">Save Comment</button>
        </div>
    `;
    
    const playBtn = document.getElementById(`play-btn-${song.id}`);
    if (song.is_downloaded) {
        playBtn.addEventListener('click', () => {
             playSong(song);
        });
    }

    const likeBtn = songDetailsPanel.querySelector(`.like-btn[data-id="${song.id}"]`);
    const dislikeBtn = songDetailsPanel.querySelector(`.dislike-btn[data-id="${song.id}"]`);
    const commentSaveBtn = document.getElementById(`comment-save-${song.id}`);
    const commentInput = document.getElementById(`comment-input-${song.id}`);

    likeBtn.addEventListener('click', () => toggleLikeStatus(song.id, 'liked'));
    dislikeBtn.addEventListener('click', () => toggleLikeStatus(song.id, 'disliked'));
    
    commentSaveBtn.addEventListener('click', async () => {
        const val = commentInput.value;
        const originalText = commentSaveBtn.textContent;
        commentSaveBtn.textContent = 'Saving...';
        await saveUserData(song.id, 'comment', val);
        commentSaveBtn.textContent = 'Saved!';
        setTimeout(() => commentSaveBtn.textContent = originalText, 2000);
    });
}

// ── Playback ───────────────────────────────────────────────────────────────
function playSong(song) {
    if (!song.is_downloaded) return;

    const newSrc = `/api/audio/${currentWorkspaceId}/${song.id}`;

    // Update now-playing info
    const imgUrl = song.image_url || 'https://cdn1.suno.ai/defaultBlue.webp';
    nowPlayingImg.src = imgUrl;
    nowPlayingTitle.textContent = song.title || 'Untitled';
    nowPlayingTags.textContent = song.metadata && song.metadata.tags ? song.metadata.tags : '';

    audioPlayerContainer.classList.remove('hidden');

    // Explicitly stop and empty previous track to ensure waveform refreshes
    wavesurfer.stop();
    try { wavesurfer.empty(); } catch(e) {} // Handle older api just in case
    
    // Always start from the beginning and update waveform
    currentPlayingSongId = song.id;
    waveformCurrentEl.textContent = '0:00';
    waveformDurationEl.textContent = '0:00';
    wavesurfer.load(newSrc);
}

// ── Search ─────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
    renderSongs(e.target.value);
});

// ── Like/Dislike ───────────────────────────────────────────────────────────
async function toggleLikeStatus(songId, targetStatus) {
    if (!userSongData[songId]) userSongData[songId] = { likeStatus: null, comment: '' };
    
    let newStatus = targetStatus;
    if (userSongData[songId].likeStatus === targetStatus) newStatus = null;
    
    userSongData[songId].likeStatus = newStatus;
    
    document.querySelectorAll(`.like-btn[data-id="${songId}"]`).forEach(btn => btn.classList.remove('active-like'));
    document.querySelectorAll(`.dislike-btn[data-id="${songId}"]`).forEach(btn => btn.classList.remove('active-dislike'));
    
    if (newStatus === 'liked') {
        document.querySelectorAll(`.like-btn[data-id="${songId}"]`).forEach(btn => btn.classList.add('active-like'));
    }
    if (newStatus === 'disliked') {
        document.querySelectorAll(`.dislike-btn[data-id="${songId}"]`).forEach(btn => btn.classList.add('active-dislike'));
    }
    
    await saveUserData(songId, 'likeStatus', newStatus);
}

async function saveUserData(songId, action, value) {
    if (!userSongData[songId]) userSongData[songId] = { likeStatus: null, comment: '' };
    userSongData[songId][action] = value;
    
    try {
        await fetch(`/api/user-data/${songId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, value })
        });
    } catch(err) {
        console.error('Failed to save user data', err);
    }
}

// Start app
init();

// ── Job Runner ─────────────────────────────────────────────────────────────
function runJob(url, title, triggerBtn, onComplete) {
    // Show pulsing dot to signal active job
    jobModalTitle.innerHTML = `<span class="job-running-dot"></span>${title}`;
    jobLog.textContent = '';
    jobModal.classList.remove('hidden');
    jobModalClose.disabled = true;
    if (triggerBtn) {
        triggerBtn.classList.add('running');
        triggerBtn.disabled = true;
    }

    const markDone = () => {
        jobModalTitle.textContent = title; // remove dot
        jobModalClose.disabled = false;
        if (triggerBtn) { triggerBtn.classList.remove('running'); triggerBtn.disabled = false; }
        if (typeof onComplete === 'function') onComplete();
    };

    fetch(url, { method: 'POST' })
        .then(async res => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                jobLog.textContent += '\n❌ ' + (err.error || res.statusText);
                return;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            let finished = false;
            while (!finished) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    try {
                        const payload = JSON.parse(line.slice(5).trim());
                        if (payload.msg !== undefined) {
                            jobLog.textContent += payload.msg + '\n';
                            jobLog.scrollTop = jobLog.scrollHeight;
                        }
                        if (payload.done) { finished = true; break; }
                    } catch(e) {}
                }
            }
        })
        .catch(err => {
            jobLog.textContent += '\n❌ Fetch error: ' + err.message;
        })
        .finally(markDone);
}

// Sidebar – scrape workspaces
document.getElementById('btn-scrape-workspaces').addEventListener('click', function() {
    runJob('/api/jobs/scrape-workspaces', 'Scraping workspace list from SUNO…', this,
        () => init() // reload workspaces list when done
    );
});

// Header toolbar – scrape songs for current workspace
document.getElementById('btn-scrape-songs').addEventListener('click', function() {
    if (!currentWorkspaceId) return;
    runJob(
        `/api/jobs/scrape-workspace-songs/${currentWorkspaceId}`,
        `Scraping songs for "${workspacesData[currentWorkspaceId]?.name || currentWorkspaceId}"…`,
        this,
        () => selectWorkspace(currentWorkspaceId) // reload song list when done
    );
});

// Header toolbar – download MP3s
document.getElementById('btn-download-mp3').addEventListener('click', function() {
    if (!currentWorkspaceId) return;
    runJob(
        `/api/jobs/download-mp3/${currentWorkspaceId}`,
        `Downloading MP3s for "${workspacesData[currentWorkspaceId]?.name || currentWorkspaceId}"…`,
        this,
        () => selectWorkspace(currentWorkspaceId)
    );
});

// Header toolbar – download WAVs
document.getElementById('btn-download-wav').addEventListener('click', function() {
    if (!currentWorkspaceId) return;
    runJob(
        `/api/jobs/download-wav/${currentWorkspaceId}`,
        `Downloading WAVs for "${workspacesData[currentWorkspaceId]?.name || currentWorkspaceId}"…`,
        this,
        () => selectWorkspace(currentWorkspaceId)
    );
});
