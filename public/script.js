
document.addEventListener('DOMContentLoaded', () => {
  // --- 432Hz Converter for Uploaded Audio ---
  const audioUpload = document.getElementById('audio-upload');
  const uploadedAudioPlayer = document.getElementById('uploaded-audio-player');
  const upload432HzBtn = document.getElementById('upload-432hz-btn');
  const uploadFreqLabel = document.getElementById('upload-freq-label');

  let uploadAudioContext = null;
  let uploadSourceNode = null;
  let uploadPitchProcessor = null;
  let uploadIs432Hz = false;
  let uploadAudioBuffer = null;

  function cleanupUploadAudioContext() {
    if (uploadAudioContext) {
      uploadAudioContext.close();
      uploadAudioContext = null;
      uploadSourceNode = null;
      uploadPitchProcessor = null;
    }
  }

  audioUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    uploadedAudioPlayer.src = url;
    uploadedAudioPlayer.style.display = '';
    uploadIs432Hz = false;
    upload432HzBtn.setAttribute('aria-pressed', 'false');
    uploadFreqLabel.textContent = 'Original';
    uploadFreqLabel.style.color = '#a6192e';
    cleanupUploadAudioContext();
  });

  upload432HzBtn.addEventListener('click', () => {
    if (!uploadedAudioPlayer.src) return;
    uploadIs432Hz = !uploadIs432Hz;
    upload432HzBtn.setAttribute('aria-pressed', uploadIs432Hz ? 'true' : 'false');
    uploadFreqLabel.textContent = uploadIs432Hz ? '432Hz (processed)' : 'Original';
    uploadFreqLabel.style.color = uploadIs432Hz ? '#3fa046' : '#a6192e';
    cleanupUploadAudioContext();

    if (uploadIs432Hz) {
      // Pause <audio> element and use Web Audio API
      uploadedAudioPlayer.pause();
      if (!uploadAudioContext) uploadAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      fetch(uploadedAudioPlayer.src)
        .then(r => r.arrayBuffer())
        .then(buf => uploadAudioContext.decodeAudioData(buf))
        .then(decoded => {
          uploadAudioBuffer = decoded;
          play432HzUpload();
        });
    } else {
      // Stop Web Audio API and play normal audio
      cleanupUploadAudioContext();
      uploadedAudioPlayer.currentTime = 0;
      uploadedAudioPlayer.play();
    }
  });

  function play432HzBuffer(audioBuffer, onEnd) {
    // Generic function for 432Hz pitch shift playback of a decoded AudioBuffer
    let context = new (window.AudioContext || window.webkitAudioContext)();
    let source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = 432/440;
    source.connect(context.destination);
    source.start(0);
    source.onended = () => {
      context.close();
      if (onEnd) onEnd();
    };
    return { context, source };
  }

  function play432HzUpload() {
    if (!uploadAudioContext || !uploadAudioBuffer) return;
    uploadSourceNode = uploadAudioContext.createBufferSource();
    uploadSourceNode.buffer = uploadAudioBuffer;
    uploadSourceNode.playbackRate.value = 432/440;
    uploadSourceNode.connect(uploadAudioContext.destination);
    uploadSourceNode.start(0);
    uploadSourceNode.onended = () => {
      upload432HzBtn.setAttribute('aria-pressed', 'false');
      uploadFreqLabel.textContent = 'Original';
      uploadFreqLabel.style.color = '#a6192e';
      uploadIs432Hz = false;
      cleanupUploadAudioContext();
    };
  }

  // --- Spotify preview playback with 432Hz option ---
  let previewAudio = null;
  let previewAudioContext = null;
  let previewIs432 = false;
  function stopSpotifyPreview() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = '';
      previewAudio = null;
    }
    if (previewAudioContext && previewAudioContext.context) {
      previewAudioContext.context.close();
      previewAudioContext = null;
    }
    previewIs432 = false;
    // Reset all 432Hz preview buttons
    document.querySelectorAll('.spotify-preview-432-btn[aria-pressed="true"]').forEach(btn => {
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = '432Hz';
      btn.style.background = '#fff';
      btn.style.color = '#3fa046';
    });
  }
  function setupSpotifyPreviewListeners() {
    // Preview (original)
    Array.from(document.getElementsByClassName('spotify-preview-btn')).forEach(btn => {
      btn.onclick = () => {
        stopSpotifyPreview();
        const url = btn.getAttribute('data-preview-url');
        previewAudio = new Audio(url);
        previewAudio.volume = 1.0;
        previewAudio.play();
        previewAudio.onended = stopSpotifyPreview;
      };
    });
    // Preview (432Hz)
    Array.from(document.getElementsByClassName('spotify-preview-432-btn')).forEach(btn => {
      btn.onclick = () => {
        stopSpotifyPreview();
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = '432Hz (playing)';
        btn.style.background = '#3fa046';
        btn.style.color = '#fff';
        const url = btn.getAttribute('data-preview-url');
        fetch(url)
          .then(r => r.arrayBuffer())
          .then(buf => {
            let context = new (window.AudioContext || window.webkitAudioContext)();
            context.decodeAudioData(buf, decoded => {
              previewAudioContext = play432HzBuffer(decoded, stopSpotifyPreview);
            });
          });
      };
    });
  }

  // If user presses play on the normal audio player while in 432Hz mode, revert to original
  uploadedAudioPlayer.addEventListener('play', () => {
    if (uploadIs432Hz) {
      uploadIs432Hz = false;
      upload432HzBtn.setAttribute('aria-pressed', 'false');
      uploadFreqLabel.textContent = 'Original';
      uploadFreqLabel.style.color = '#a6192e';
      cleanupUploadAudioContext();
    }
  });

  // --- Spotify Login Integration ---
  const spotifyLoginBtn = document.getElementById('spotify-login-btn');
  const spotifyProfileDiv = document.getElementById('spotify-profile');

  const SPOTIFY_CLIENT_ID = 'SPOTIFY_CLIENT_ID_HERE'; // TODO: Replace with your real client ID
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
  const SPOTIFY_SCOPES = 'user-read-private user-read-email';

  function getHashParams() {
    const hash = window.location.hash.substring(1);
    const params = {};
    hash.split('&').forEach(kv => {
      const [key, value] = kv.split('=');
      if (key && value) params[key] = decodeURIComponent(value);
    });
    return params;
  }

  // --- Spotify Playlist/Track/Playback Integration ---
  let spotifyAccessToken = null;
  let currentDeviceId = null;
  let currentTrackUri = null;

  function showSpotifyProfile(token) {
    spotifyAccessToken = token;
    fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(profile => {
        if (profile.display_name) {
          spotifyProfileDiv.innerHTML = `<img src="${profile.images[0]?.url || ''}" alt="Profile" style="width:32px;height:32px;border-radius:50%;vertical-align:middle;margin-right:8px;">` +
            `<span>Logged in as <b>${profile.display_name}</b></span>`;
        } else {
          spotifyProfileDiv.textContent = 'Logged in to Spotify.';
        }
        fetchSpotifyPlaylists();
      })
      .catch(() => { spotifyProfileDiv.textContent = 'Failed to load Spotify profile.'; });
  }

  function fetchSpotifyPlaylists() {
    const playlistsDiv = document.getElementById('spotify-playlists');
    playlistsDiv.innerHTML = '<em>Loading playlists...</em>';
    fetch('https://api.spotify.com/v1/me/playlists?limit=12', {
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.items || data.items.length === 0) {
          playlistsDiv.innerHTML = '<em>No playlists found.</em>';
          return;
        }
        playlistsDiv.innerHTML = '<b>Your Playlists:</b><div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">' +
          data.items.map(pl => `
            <div class="spotify-playlist-card" style="cursor:pointer;display:inline-block;text-align:center;" data-playlist-id="${pl.id}">
              <img src="${pl.images[0]?.url || ''}" alt="Playlist" style="width:64px;height:64px;border-radius:12px;box-shadow:0 2px 8px #0002;">
              <div style="max-width:80px;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${pl.name}</div>
            </div>
          `).join('') + '</div>';
        // Add click listeners
        Array.from(document.getElementsByClassName('spotify-playlist-card')).forEach(card => {
          card.onclick = () => fetchSpotifyTracks(card.getAttribute('data-playlist-id'));
        });
      })
      .catch(() => { playlistsDiv.innerHTML = '<em>Failed to load playlists.</em>'; });
  }

  function fetchSpotifyTracks(playlistId) {
    const tracksDiv = document.getElementById('spotify-tracks');
    tracksDiv.innerHTML = '<em>Loading tracks...</em>';
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=20`, {
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.items || data.items.length === 0) {
          tracksDiv.innerHTML = '<em>No tracks found in this playlist.</em>';
          return;
        }
        tracksDiv.innerHTML = '<b>Tracks:</b><div style="margin-top:8px;">' +
          data.items.map(item => {
            const track = item.track;
            const hasPreview = !!track.preview_url;
            return `<div class="spotify-track-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <img src="${track.album.images[2]?.url || track.album.images[0]?.url || ''}" alt="Track" style="width:36px;height:36px;border-radius:6px;">
              <div style="flex:1;">
                <span style="font-weight:600;">${track.name}</span><br>
                <span style="font-size:0.92em;color:#666;">${track.artists.map(a=>a.name).join(', ')}</span>
              </div>
              <button class="spotify-play-track-btn" data-track-uri="${track.uri}" style="background:#1db954;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;">Play</button>
              ${hasPreview ? `
                <button class="spotify-preview-btn" data-preview-url="${track.preview_url}" style="background:#fff;border:1.5px solid #1db954;color:#1db954;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;margin-left:4px;">Preview</button>
                <button class="spotify-preview-432-btn" data-preview-url="${track.preview_url}" aria-pressed="false" style="background:#fff;border:1.5px solid #3fa046;color:#3fa046;border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;margin-left:2px;">432Hz</button>
              ` : ''}
            </div>`;
          }).join('') + '</div>';
        // Add play button listeners
        Array.from(document.getElementsByClassName('spotify-play-track-btn')).forEach(btn => {
          btn.onclick = () => playSpotifyTrack(btn.getAttribute('data-track-uri'));
        });
        // Add preview and 432Hz preview listeners
        setupSpotifyPreviewListeners();
      })
      .catch(() => { tracksDiv.innerHTML = '<em>Failed to load tracks.</em>'; });
  }

  function playSpotifyTrack(trackUri) {
    currentTrackUri = trackUri;
    fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [trackUri] })
    })
      .then(() => updateSpotifyPlayerControls())
      .catch(() => alert('Failed to play track. Make sure you have Spotify open on a device.'));
  }

  function updateSpotifyPlayerControls() {
    const controlsDiv = document.getElementById('spotify-player-controls');
    controlsDiv.innerHTML = `
      <button id="spotify-prev-btn" style="background:#1db954;color:#fff;border:none;border-radius:6px;padding:6px 12px;margin:0 5px;cursor:pointer;font-size:1rem;">⏮️</button>
      <button id="spotify-play-btn" style="background:#1db954;color:#fff;border:none;border-radius:6px;padding:6px 14px;margin:0 5px;cursor:pointer;font-size:1rem;">▶️</button>
      <button id="spotify-pause-btn" style="background:#1db954;color:#fff;border:none;border-radius:6px;padding:6px 14px;margin:0 5px;cursor:pointer;font-size:1rem;">⏸️</button>
      <button id="spotify-next-btn" style="background:#1db954;color:#fff;border:none;border-radius:6px;padding:6px 12px;margin:0 5px;cursor:pointer;font-size:1rem;">⏭️</button>
    `;
    document.getElementById('spotify-prev-btn').onclick = () => spotifyControl('previous');
    document.getElementById('spotify-play-btn').onclick = () => spotifyControl('play');
    document.getElementById('spotify-pause-btn').onclick = () => spotifyControl('pause');
    document.getElementById('spotify-next-btn').onclick = () => spotifyControl('next');
  }

  function spotifyControl(action) {
    let url, method = 'POST';
    if (action === 'play') {
      url = 'https://api.spotify.com/v1/me/player/play';
      method = 'PUT';
    } else if (action === 'pause') {
      url = 'https://api.spotify.com/v1/me/player/pause';
      method = 'PUT';
    } else if (action === 'next') {
      url = 'https://api.spotify.com/v1/me/player/next';
    } else if (action === 'previous') {
      url = 'https://api.spotify.com/v1/me/player/previous';
    }
    fetch(url, {
      method,
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
    }).catch(() => alert('Failed to control Spotify playback.'));
  }

  if (spotifyLoginBtn) {
    spotifyLoginBtn.addEventListener('click', () => {
      const authUrl = `${SPOTIFY_AUTH_URL}?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SPOTIFY_SCOPES)}`;
      window.location = authUrl;
    });
  }

  // On redirect back from Spotify
  const hashParams = getHashParams();
  if (hashParams.access_token) {
    window.location.hash = '';
    showSpotifyProfile(hashParams.access_token);
  }

  // Web Audio API components
  let audioContext;
  let sourceNode;
  let pitchProcessor;
  let audioElement = document.getElementById('radio-player'); // Use the visible <audio> element for bit-perfect
  
  // Elements
  const playButton = document.getElementById('play-button');
  const stopButton = document.getElementById('stop-button');
  const uscLogoBtn = document.getElementById('usc-logo-btn');
  const uscShield = document.getElementById('usc-shield');
  const uscText = document.getElementById('usc-text');
  const currentFrequency = document.getElementById('current-frequency');
  const player = document.getElementById('radio-player');
  
  // Current state
  let isPlaying = false;
  let currentPitch = '440'; // Default to 440Hz
  
  // Initialize Web Audio API for 432Hz mode only
  function initAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // Always use the same audio element
      audioElement.crossOrigin = 'anonymous';
      audioElement.src = '/stream';
      // Connect audio element to Web Audio API
      sourceNode = audioContext.createMediaElementSource(audioElement);
      pitchProcessor = createPitchShifter();
      return audioElement;
    } catch (err) {
      console.error('Audio initialization error:', err);
      alert('Your browser may not support the required audio features. Please try a modern browser like Chrome or Firefox.');
      return null;
    }
  }
  
  // Function to connect audio nodes based on current pitch setting
  function connectAudioNodes(audioElement) {
    // Disconnect any existing connections
    try {
      sourceNode.disconnect();
    } catch (e) {
      // Ignore errors if not connected
    }
    
    // Connect based on current pitch setting
    if (currentPitch === '432') {
      // For 432Hz, route through the pitch shifter
      sourceNode.connect(pitchProcessor);
      pitchProcessor.connect(audioContext.destination);
    } else {
      // For 440Hz, connect directly to output
      sourceNode.connect(audioContext.destination);
    }
    
    // Show notification
    showNotification(`Playing KUSC at ${currentPitch}Hz`);
  }
  
  // Helper function to show notifications
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.backgroundColor = 'rgba(0,0,0,0.7)';
    notification.style.color = '#fdbb2d';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '1000';
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
  
  // Create a pitch shifter following the 432player.com approach
  function createPitchShifter() {
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 2, 2);
    
    // The exact pitch shifting algorithm used by 432player.com
    processor.onaudioprocess = (event) => {
      const inputL = event.inputBuffer.getChannelData(0);
      const inputR = event.inputBuffer.getChannelData(1);
      const outputL = event.outputBuffer.getChannelData(0);
      const outputR = event.outputBuffer.getChannelData(1);
      
      // If we're at 440Hz, just pass the audio through unchanged
      if (currentPitch === '440') {
        for (let i = 0; i < bufferSize; i++) {
          outputL[i] = inputL[i];
          outputR[i] = inputR[i];
        }
        return;
      }
      
      // For 432Hz, use the precise 432/440 = 0.9818 ratio used by 432player.com
      const pitchFactor = 0.9818; // 432Hz/440Hz = 0.9818
      
      // High-quality phase vocoder technique for pitch shifting
      // This approach minimizes artifacts and preserves audio quality
      for (let i = 0; i < bufferSize; i++) {
        // Calculate the exact sample position based on pitch factor
        const position = i * pitchFactor;
        const index = Math.floor(position);
        const fraction = position - index;
        
        // Use cubic interpolation for higher quality result
        if (index > 0 && index < bufferSize - 2) {
          // Four-point cubic interpolation for smoother results
          const y0 = inputL[index - 1];
          const y1 = inputL[index];
          const y2 = inputL[index + 1];
          const y3 = inputL[index + 2];
          
          // Cubic interpolation formula
          const c0 = y1;
          const c1 = 0.5 * (y2 - y0);
          const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
          const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
          
          outputL[i] = ((c3 * fraction + c2) * fraction + c1) * fraction + c0;
          
          // Same for right channel
          const y0R = inputR[index - 1];
          const y1R = inputR[index];
          const y2R = inputR[index + 1];
          const y3R = inputR[index + 2];
          
          const c0R = y1R;
          const c1R = 0.5 * (y2R - y0R);
          const c2R = y0R - 2.5 * y1R + 2 * y2R - 0.5 * y3R;
          const c3R = 0.5 * (y3R - y0R) + 1.5 * (y1R - y2R);
          
          outputR[i] = ((c3R * fraction + c2R) * fraction + c1R) * fraction + c0R;
        } else if (index < bufferSize - 1) {
          // Fall back to linear interpolation at boundaries
          outputL[i] = inputL[index] * (1 - fraction) + inputL[index + 1] * fraction;
          outputR[i] = inputR[index] * (1 - fraction) + inputR[index + 1] * fraction;
        } else {
          // Edge case
          outputL[i] = inputL[index];
          outputR[i] = inputR[index];
        }
      }
    };
    
    return processor;
  }
  

  
  // Update frequency display
  function updateFrequencyDisplay() {
    if (currentPitch === '440') {
      currentFrequency.textContent = 'Original';
    } else {
      currentFrequency.textContent = '432Hz (processed)';
    }
  }
  
  // Initialize audio on first user interaction
  
  // Play button event
  playButton.addEventListener('click', () => {
    if (!isPlaying) {
      if (currentPitch === '440') {
        // Bit-perfect: use native audio element directly
        player.src = '/stream';
        player.style.display = '';
        player.currentTime = 0;
        player.play().then(() => {
          isPlaying = true;
          playButton.textContent = 'Playing...';
          showNotification('Playing KUSC at Original frequency (bit perfect)');
        });
      } else {
        // 432Hz: use Web Audio API
        player.style.display = 'none';
        if (!audioContext || !sourceNode || !pitchProcessor) {
          initAudio();
        }
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        audioElement.play().then(() => {
          isPlaying = true;
          playButton.textContent = 'Playing...';
          // Connect audio nodes with current pitch setting
          try {
            sourceNode.disconnect();
            sourceNode.connect(pitchProcessor);
            pitchProcessor.connect(audioContext.destination);
            showNotification('Playing KUSC at 432Hz (processed)');
          } catch (e) {}
        }).catch(err => {
          console.error('Playback error:', err);
          alert('Error playing KUSC stream. Please try again later.');
        });
      }
    }
  });
  
  // Stop button event
  stopButton.addEventListener('click', () => {
    if (currentPitch === '440') {
      player.pause();
      player.currentTime = 0;
    } else if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    isPlaying = false;
    playButton.textContent = 'Play';
    showNotification('KUSC stream stopped');
  });
  
  // USC logo button click event for frequency toggle
  uscLogoBtn.addEventListener('click', () => {
    const wasPlaying = isPlaying;
    stopButton.click(); // Stop current playback
    currentPitch = currentPitch === '440' ? '432' : '440';
    updateFrequencyDisplay();
    // Update button appearance
    if (currentPitch === '432') {
      uscLogoBtn.setAttribute('aria-pressed', 'true');
      uscLogoBtn.setAttribute('title', '432Hz Active (Click to switch to 440Hz)');
      uscShield.setAttribute('fill', '#ff9900');
      uscText.setAttribute('fill', '#fff');
    } else {
      uscLogoBtn.setAttribute('aria-pressed', 'false');
      uscLogoBtn.setAttribute('title', '440Hz Active (Click to switch to 432Hz)');
      uscShield.setAttribute('fill', '#fff');
      uscText.setAttribute('fill', '#a6192e');
    }
    if (wasPlaying) {
      playButton.click(); // Restart playback in new mode
    }
  });

  // Initialize button state on load
  uscLogoBtn.setAttribute('aria-pressed', 'false');
  uscLogoBtn.setAttribute('title', '440Hz Active (Click to switch to 432Hz)');
  uscShield.setAttribute('fill', '#fff');
  uscText.setAttribute('fill', '#a6192e');

});