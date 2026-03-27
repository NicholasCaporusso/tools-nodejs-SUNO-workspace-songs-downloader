let workspacesData = {};
let currentWorkspaceId = null;
let currentSongsMap = new Map();
let currentPlayingSongId = null;
let userSongData = {};

// Elements
const workspaceListEl = document.getElementById('workspace-list');
const songListEl = document.getElementById('song-list');
const searchInput = document.getElementById('search-input');
const searchContainer = document.getElementById('search-container');
const currentWsNameEl = document.getElementById('current-workspace-name');
const sunoWsLink = document.getElementById('suno-workspace-link');
const songDetailsPanel = document.getElementById('song-details-panel');
const audioPlayerContainer = document.getElementById('audio-player-container');
const audioPlayer = document.getElementById('audio-player');
const nowPlayingImg = document.getElementById('now-playing-img');
const nowPlayingTitle = document.getElementById('now-playing-title');
const nowPlayingTags = document.getElementById('now-playing-tags');

// Initialize
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

function renderWorkspaces() {
    workspaceListEl.innerHTML = '';
    
    // Convert to array and sort: default first, then alphabetically by name
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
    
    // Sort by created_at descending
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    
    filtered.forEach(song => {
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
        
        const isPlaying = (currentPlayingSongId === song.id && !audioPlayer.paused);
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

function playSong(song) {
    if (!song.is_downloaded) return;

    const newSrc = `/api/audio/${currentWorkspaceId}/${song.id}`;
    
    if (audioPlayer.getAttribute('src') !== newSrc) {
        currentPlayingSongId = song.id;
        
        // Update player UI
        const imgUrl = song.image_url || 'https://cdn1.suno.ai/defaultBlue.webp';
        nowPlayingImg.src = imgUrl;
        nowPlayingTitle.textContent = song.title || 'Untitled';
        nowPlayingTags.textContent = song.metadata && song.metadata.tags ? song.metadata.tags : '';
        
        audioPlayerContainer.classList.remove('hidden');
        audioPlayer.src = newSrc;
        audioPlayer.play();
    } else {
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    }
}

// Reactively keep play/pause icons synced across UI
audioPlayer.addEventListener('play', () => renderSongs(searchInput.value));
audioPlayer.addEventListener('pause', () => renderSongs(searchInput.value));

searchInput.addEventListener('input', (e) => {
    renderSongs(e.target.value);
});

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
