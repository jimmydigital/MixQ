from flask import Flask, render_template, jsonify, request
import subprocess
import time
from werkzeug.serving import WSGIRequestHandler
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import shlex  # For shell escape

app = Flask(__name__)

# Silence access logs
class SilentRequestHandler(WSGIRequestHandler):
    def log(self, format, *args):
        return

app.logger.setLevel('ERROR')

# Rate limiting to prevent abuse
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"]  # Adjust as needed
)

# Modeled player state
player_state = {
    'state': 'stopped',
    'current_id': '',
    'current_name': '',
    'current_artist': '',
    'current_album': '',
    'current_duration': 0,
    'start_time': 0.0,
    'pause_time': 0.0,
}

def run_applescript(script):
    try:
        process = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=5)
        return process.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError) as e:
        app.logger.error(f"AppleScript error: {str(e)}")
        return ""

def get_playlists():
    script = 'tell application "Music" to get name of every user playlist'
    raw = run_applescript(script)
    if not raw:
        return []
    return raw.split(', ')

def get_tracks_from_playlist(playlist_name):
    script = f'''
    tell application "Music"
        set trackList to {{}}
        try
            set thePlaylist to playlist "{shlex.quote(playlist_name)}"  # Escape playlist_name
            repeat with t in tracks of thePlaylist
                set pid to persistent ID of t as string
                set tName to name of t
                set tArtist to artist of t
                set tAlbum to album of t
                set tDuration to duration of t
                
                set AppleScript's text item delimiters to "~"
                set escapedName to tName's text items
                set AppleScript's text item delimiters to "~~"
                set escapedName to escapedName as string
                
                set escapedArtist to tArtist's text items
                set AppleScript's text item delimiters to "~~"
                set escapedArtist to escapedArtist as string
                
                set escapedAlbum to tAlbum's text items
                set AppleScript's text item delimiters to "~~"
                set escapedAlbum to escapedAlbum as string
                
                set trackStr to pid & "~" & escapedName & "~" & escapedArtist & "~" & escapedAlbum & "~" & tDuration
                set end of trackList to trackStr
            end repeat
        end try
        if (count of trackList) = 0 then
            return "NO_TRACKS"
        end if
        set AppleScript's text item delimiters to "|||"
        return trackList as string
    end tell
    '''
    raw = run_applescript(script)
    if raw == "NO_TRACKS" or not raw:
        return []

    tracks = []
    track_strings = raw.split("|||")
    for track_str in track_strings:
        if not track_str.strip():
            continue
        parts = track_str.split("~")
        if len(parts) == 5:
            pid, name, artist, album, duration_str = parts
            name = name.replace("~~", "~")
            artist = artist.replace("~~", "~")
            album = album.replace("~~", "~")
            try:
                duration = int(float(duration_str))
            except ValueError:
                duration = 0
            tracks.append({
                'id': pid.strip(),
                'name': name.strip(),
                'artist': artist.strip(),
                'album': album.strip(),
                'duration': duration
            })
    return tracks

def get_current_track_details():
    script = '''
    tell application "Music"
        set pState to player state as string
        if pState is "playing" or pState is "paused" then
            set t to current track
            return {state:pState, id:persistent ID of t as string, name:name of t, artist:artist of t, album:album of t, duration:duration of t}
        else
            return {state:"stopped", id:"", name:"", artist:"", album:"", duration:0}
        end if
    end tell
    '''
    raw = run_applescript(script)
    if not raw:
        return {'state': 'stopped', 'id': '', 'name': '', 'artist': '', 'album': '', 'duration': 0}

    parts = raw.split(', ')
    state = parts[0].split(':')[1].strip('"')
    if len(parts) == 6:
        return {
            'state': state,
            'id': parts[1].split(':')[1].strip('"'),
            'name': parts[2].split(':')[1].strip('"'),
            'artist': parts[3].split(':')[1].strip('"'),
            'album': parts[4].split(':')[1].strip('"'),
            'duration': int(float(parts[5].split(':')[1]))
        }
    return {'state': state, 'id': '', 'name': '', 'artist': '', 'album': '', 'duration': 0}

def play_track(track_id):
    # Sanitize track_id (only allow hex chars - persistent IDs are hex)
    if not all(c in '0123456789ABCDEFabcdef' for c in track_id):
        app.logger.error(f"Invalid track_id: {track_id}")
        return False

    script = f'''
    tell application "Music"
        play (first track whose persistent ID is "{track_id}")
    end tell
    '''
    run_applescript(script)
    return True

@app.route('/')
@limiter.limit("20/minute")
def index():
    playlists = get_playlists()
    return render_template('index.html', playlists=playlists)

@app.route('/load_playlist', methods=['POST'])
@limiter.limit("10/minute")
def load_playlist():
    data = request.json
    if not data or 'playlist' not in data:
        return jsonify(success=False, error="Missing playlist name"), 400

    playlist_name = data['playlist']
    if not isinstance(playlist_name, str) or len(playlist_name) > 100:  # Basic validation
        return jsonify(success=False, error="Invalid playlist name"), 400

    tracks = get_tracks_from_playlist(playlist_name)
    return jsonify(queue=tracks)

@app.route('/play_specific', methods=['POST'])
@limiter.limit("20/minute")
def play_specific():
    data = request.json
    if not data or 'track_id' not in data:
        return jsonify(success=False, error="Missing track_id"), 400

    track_id = data['track_id']
    if not isinstance(track_id, str) or len(track_id) != 16 or not all(c in '0123456789ABCDEFabcdef' for c in track_id):  # Validate hex ID
        return jsonify(success=False, error="Invalid track_id"), 400

    success = play_track(track_id)
    if success:
        details = get_current_track_details()
        if details['state'] == 'playing':
            player_state['state'] = 'playing'
            player_state['current_id'] = track_id
            player_state['current_name'] = details['name']
            player_state['current_artist'] = details['artist']
            player_state['current_album'] = details['album']
            player_state['current_duration'] = details['duration']
            player_state['start_time'] = time.time()
            player_state['pause_time'] = 0.0
    return jsonify(success=success)

@app.route('/control', methods=['POST'])
@limiter.limit("20/minute")
def control():
    data = request.json
    if not data or 'action' not in data:
        return jsonify(success=False, error="Missing action"), 400

    action = data['action']
    if not isinstance(action, str) or len(action) > 50:
        return jsonify(success=False, error="Invalid action"), 400

    # Validate allowed actions (prevent arbitrary commands)
    allowed_actions = ['playpause', 'next track', 'previous track']
    if action not in allowed_actions:
        return jsonify(success=False, error="Invalid action"), 400

    script = f'tell application "Music" to {action}'
    run_applescript(script)
    return jsonify(success=True)

@app.route('/current_track')
@limiter.limit("60/minute")  # Higher limit for polling
def current_track():
    details = get_current_track_details()
    state = details['state']
    if state == 'playing':
        elapsed = time.time() - player_state['start_time']
        remaining = max(0, player_state['current_duration'] - elapsed)
        details['elapsed'] = elapsed
        details['remaining'] = remaining
    elif state == 'paused':
        elapsed = player_state['pause_time'] - player_state['start_time']
        remaining = max(0, player_state['current_duration'] - elapsed)
        details['elapsed'] = elapsed
        details['remaining'] = remaining
    else:
        details['elapsed'] = 0
        details['remaining'] = 0

    return jsonify(details=details)

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('favicon.ico')

def main():
    # Start Flask in thread
    def run_flask():
        app.run(host='0.0.0.0', port=8085, debug=False, use_reloader=False, request_handler=SilentRequestHandler)

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Return URL for web view
    return "http://127.0.0.1:8085"

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=8085, request_handler=SilentRequestHandler)
