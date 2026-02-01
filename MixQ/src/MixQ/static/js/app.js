let queue = [];
let selectedTimeZone = localStorage.getItem('preferredTimeZone') || 
                       (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
let lastPlayingState = false;

// Common/popular IANA timezones
const commonTimeZones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Asia/Kolkata'
];

// ────────────────────────────────────────────────
// Helper & Utility Functions (defined first)
// ────────────────────────────────────────────────

const DEBUG = false;

// Safe console wrapper (no-op when disabled)
const log = DEBUG ? console.log.bind(console) : () => {};

// Theme toggle
function toggleTheme() {
    const body = document.body;
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        toggleBtn.textContent = '🌙';
        localStorage.setItem('theme', 'light');
        log("Switched to light mode");
    } else {
        body.classList.add('dark-mode');
        toggleBtn.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
        log("Switched to dark mode");
    }
}

// Apply saved theme on load
function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const toggleBtn = document.getElementById('theme-toggle');
    
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        if (toggleBtn) toggleBtn.textContent = '☀️';
    } else {
        body.classList.remove('dark-mode');
        if (toggleBtn) toggleBtn.textContent = '🌙';
    }
}



function saveQueue() {
    localStorage.setItem('musicQueue', JSON.stringify(queue));
    log("Queue saved to localStorage");
}

function populateTimeZoneSelect() {
    log("populateTimeZoneSelect() started");
    const select = document.getElementById('tz-select');
    if (!select) {
        console.error("ERROR: #tz-select element not found inside populate function");
        return;
    }

    // Clear existing options beyond the default
    while (select.options.length > 1) {
        select.remove(1);
    }

    commonTimeZones.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz;
        option.text = tz.replace(/_/g, ' ');
        if (tz === selectedTimeZone) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Add browser-reported TZ if not in common list
    if (selectedTimeZone && !commonTimeZones.includes(selectedTimeZone)) {
        const opt = document.createElement('option');
        opt.value = selectedTimeZone;
        opt.text = `Browser: ${selectedTimeZone.replace(/_/g, ' ')}`;
        opt.selected = true;
        select.insertBefore(opt, select.options[1]);
    }

    log(`Timezone dropdown populated - total options: ${select.options.length}`);
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatClockTime(date) {
    const tz = document.getElementById('tz-select')?.value || selectedTimeZone;
    
    const options = {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: tz || undefined
    };

    return date.toLocaleTimeString('en-US', options);
}

// ────────────────────────────────────────────────
// Core UI Functions
// ────────────────────────────────────────────────

function loadPlaylist() {
    const playlist = document.getElementById('playlist-select')?.value;
    if (!playlist) {
        console.warn("No playlist selected");
        return;
    }

    fetch('/load_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist })
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        queue = data?.queue ?? [];
        log(`Loaded ${queue.length} tracks from "${playlist}"`);
        renderQueue();
        updateNowPlaying();
        updateQueueTimes();
        saveQueue();
    })
    .catch(err => {
        console.error("Load playlist failed:", err);
        alert("Failed to load playlist");
    });
}

function renderQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;

    list.innerHTML = '';

    queue.forEach((track, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="start-time"></span>
            <button onclick="removeTrack(${index})" title="Remove track">🗑️</button>
            ${track.name || 'Unknown Title'} 
            - ${track.artist || ''} 
            [${formatDuration(track.duration || 0)}]
        `;
        li.dataset.id = track.id;
        list.appendChild(li);
    });

    if (window.Sortable) {
        Sortable.create(list, {
            animation: 150,
            onEnd: () => {
                const newQueue = [];
                list.querySelectorAll('li').forEach(li => {
                    const found = queue.find(t => t.id === li.dataset.id);
                    if (found) newQueue.push(found);
                });
                queue = newQueue;
                updateQueueTimes();
                updateNowPlaying();
                saveQueue();
            }
        });
    }

    updateQueueTimes();
    saveQueue();
}

function removeTrack(index) {
    if (index < 0 || index >= queue.length) return;
    queue.splice(index, 1);
    renderQueue();
    updateQueueTimes();
    updateNowPlaying();
    saveQueue();
}

function randomizeQueue() {
    if (queue.length === 0) {
        alert("Queue is empty — load a playlist first!");
        return;
    }

    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    renderQueue();
    updateQueueTimes();
    updateNowPlaying();
    saveQueue();
}


function control(action) {
    log(`control() called with action: "${action}"`);

    if (action === 'next track') {
        if (queue.length === 0) {
            alert("Queue is empty");
            return;
        }

        const nextTrackId = queue[0].id;
        log("Next clicked → forcing play of browser queue top track:", {
            id: nextTrackId,
            name: queue[0].name,
            artist: queue[0].artist || '(unknown)'
        });

        fetch('/play_specific', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: nextTrackId })
        })
        .then(res => {
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.success) {
                log("Next track started successfully → shifting browser queue");
                queue.shift();
                renderQueue();
                updateNowPlaying();
                updateQueueTimes();
                saveQueue();
            } else {
                console.error("Server failed to play next:", data.error || "unknown");
                alert("Could not play next track");
            }
        })
        .catch(err => {
            console.error("Play next request failed:", err);
            alert("Error playing next track");
        });
    } else {
        log(`Sending normal control action to server: "${action}"`);
        fetch('/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        })
        .then(res => {
            if (!res.ok) throw new Error(`Control failed: ${res.status}`);
            return res.json();
        })
        .then(() => {
            log(`Control "${action}" succeeded`);
            updateNowPlaying();
            updateQueueTimes();
        })
        .catch(err => {
            console.error(`Control "${action}" failed:`, err);
        });
    }
}

function updateQueueTimes() {
    fetch('/current_track')
    .then(res => res.json())
    .then(data => {
        const details = data?.details || {};
        let offsetSeconds = 0;

        if (details.state === 'playing' && details.remaining > 0) {
            offsetSeconds = details.remaining;
        } else if (details.state === 'paused' && details.remaining > 0) {
            offsetSeconds = details.remaining;  // Times do not advance on pause
        }

        let cumulativeSeconds = offsetSeconds;

        document.querySelectorAll('#queue-list li .start-time').forEach((el, index) => {
            const track = queue[index];
            if (!track) return;

            const startTime = new Date(Date.now() + cumulativeSeconds * 1000);
            el.textContent = formatClockTime(startTime) + '';
            cumulativeSeconds += track.duration || 0;
        });
    })
    .catch(err => {
        console.error("Failed to fetch current track for times:", err);
        // Fallback: no offset
        let cumulativeSeconds = 0;
        document.querySelectorAll('#queue-list li .start-time').forEach((el, index) => {
            const track = queue[index];
            if (!track) return;
            const startTime = new Date(Date.now() + cumulativeSeconds * 1000);
            el.textContent = formatClockTime(startTime) + ' | ';
            cumulativeSeconds += track.duration || 0;
        });
    });
}

function updateNowPlaying() {
    fetch('/current_track')
    .then(res => res.json())
    .then(data => {
        const details = data?.details || {};
        const nowDetails = document.getElementById('now-details');
        if (!nowDetails) return;

        if (details.id) {
            nowDetails.innerHTML = `${details.name} - ${details.artist} (${details.album}) [${formatDuration(details.duration)}]`;
            document.querySelectorAll('#queue-list li').forEach(li => {
                li.classList.toggle('current', li.dataset.id === details.id);
            });
        } else {
            nowDetails.innerHTML = 'Nothing playing';
        }
        updateQueueTimes();
    })
    .catch(err => console.error("Update now playing failed:", err));
}

// Poll for track changes every 5 seconds
setInterval(() => {
    fetch('/current_track')
    .then(res => res.json())
    .then(data => {
        const details = data?.details || {};
        const current_id = details.id || '';
        const playerState = details.state || 'stopped';
        const isPlaying = playerState === 'playing';

        // Detect true stop (not pause)
        if (playerState === 'stopped' && lastPlayingState) {
            log("True playback stop detected → auto-advancing if queue available");
            if (queue.length > 0) {
                const nextId = queue[0].id;
                fetch('/play_specific', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_id: nextId })
                })
                .then(res => res.json())
                .then(() => {
                    queue.shift();
                    renderQueue();
                    updateNowPlaying();
                    updateQueueTimes();
                    saveQueue();
                })
                .catch(err => console.error("Auto-advance failed:", err));
            }
        }

        lastPlayingState = isPlaying;

        if (queue.length && current_id && queue[0]?.id !== current_id) {
            if (queue[1]?.id === current_id) {
                log("Natural advance detected → shifting queue");
                queue.shift();
                renderQueue();
                saveQueue();
            }
        }

        updateNowPlaying();
        updateQueueTimes();
    })
    .catch(err => console.error("Poll failed:", err));
}, 5000);

// ────────────────────────────────────────────────
// Initialize everything when DOM is ready
// ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    log("DOMContentLoaded fired - starting initialization");

    applySavedTheme();
    
    // 1. Restore saved queue
    const savedQueue = localStorage.getItem('musicQueue');
    if (savedQueue) {
        try {
            queue = JSON.parse(savedQueue);
            log("Restored queue from storage:", queue.length, "tracks");
            renderQueue();
            updateNowPlaying();
            updateQueueTimes();
        } catch (e) {
            console.error("Failed to parse saved queue:", e);
            localStorage.removeItem('musicQueue');
        }
    }

    // 2. Timezone setup
    const tzSelect = document.getElementById('tz-select');
    if (tzSelect) {
        populateTimeZoneSelect();
        log("Timezone dropdown initialized");

        tzSelect.addEventListener('change', (e) => {
            selectedTimeZone = e.target.value;
            localStorage.setItem('preferredTimeZone', selectedTimeZone);
            log("Timezone changed to:", selectedTimeZone);
            updateQueueTimes();
        });

        // Restore previous selection
        if (selectedTimeZone && tzSelect.querySelector(`option[value="${selectedTimeZone}"]`)) {
            tzSelect.value = selectedTimeZone;
        }
    } else {
        console.error("ERROR: <select id=\"tz-select\"> not found in HTML");
    }
});
