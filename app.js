/**
 * Meeting Recorder & Transcriber (iOS Fixed)
 */
class MeetingRecorder {
  constructor(options = {}) {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.startTime = null;
    this.elapsedBeforePause = 0;
    this.isRecording = false;
    this.isPaused = false;
    this.timerRAF = null;
    this.onTimerUpdate = options.onTimerUpdate || (() => {});
    this.onError = options.onError || ((e) => console.error(e));
    
    // Force AAC for iOS, Opus for others
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.mimeType = isIOS ? 'audio/mp4;codecs=mp4a.40.2' : 'audio/webm;codecs=opus';
  }

  async start() {
    if (this.isRecording && !this.isPaused) return;
    try {
      // Unlock AudioContext for iOS
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) { const ctx = new AudioContext(); await ctx.resume(); }

      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100, channelCount: 1 } 
      });
      
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType, audioBitsPerSecond: 128000 });
      this.chunks = [];
      this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.recorder.start(1000);
      
      this.startTime = performance.now();
      this.isRecording = true;
      this.isPaused = false;
      this._startTimer();
    } catch (err) { this.onError(err); }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.recorder.stop();
    this.stream.getTracks().forEach(t => t.stop());
    this.elapsedBeforePause += performance.now() - this.startTime;
    this.isPaused = true;
    this._stopTimer();
  }

  async resume() {
    if (!this.isRecording || !this.isPaused) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) { const ctx = new AudioContext(); await ctx.resume(); }
      
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100, channelCount: 1 } 
      });
      
      this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType, audioBitsPerSecond: 128000 });
      this.recorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.recorder.start(1000);
      
      this.startTime = performance.now();
      this.isPaused = false;
      this._startTimer();
    } catch (err) { this.onError(err); }
  }

  stop() {
    if (!this.isRecording) return null;
    this.recorder.stop();
    this.stream.getTracks().forEach(t => t.stop());
    this._stopTimer();
    
    const duration = this.isPaused ? this.elapsedBeforePause : this.elapsedBeforePause + (performance.now() - this.startTime);
    const blob = new Blob(this.chunks, { type: this.mimeType });
    
    this._reset();
    return { blob, duration, type: this.mimeType };
  }

  _startTimer() {
    const tick = () => {
      if (!this.isRecording || this.isPaused) return;
      const current = this.elapsedBeforePause + (performance.now() - this.startTime);
      this.onTimerUpdate(current);
      this.timerRAF = requestAnimationFrame(tick);
    };
    this.timerRAF = requestAnimationFrame(tick);
  }

  _stopTimer() { if (this.timerRAF) cancelAnimationFrame(this.timerRAF); }
  
  _reset() {
    this.stream = null; this.recorder = null; this.chunks = [];
    this.startTime = null; this.elapsedBeforePause = 0;
    this.isRecording = false; this.isPaused = false;
    this._stopTimer(); this.onTimerUpdate(0);
  }
}

// --- UTILS: Convert ANY audio to WAV (Required for Whisper in Browser) ---
async function convertBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  // Create WAV file from AudioBuffer
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let i, sample;
  let offset = 0;
  let pos = 0;

  // Write WAV Header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this converter)
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // Write Interleaved Data
  for(i = 0; i < audioBuffer.numberOfChannels; i++)
    channels.push(audioBuffer.getChannelData(i));

  while(pos < audioBuffer.length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

// --- MAIN APP LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const els = {
    timer: document.getElementById('timer-display'),
    btnRec: document.getElementById('btn-record'),
    btnPause: document.getElementById('btn-pause'),
    btnResume: document.getElementById('btn-resume'),
    btnStop: document.getElementById('btn-stop'),
    statusRec: document.getElementById('record-status'),
    
    playerSection: document.getElementById('player-section'),
    audioPlayer: document.getElementById('audio-player'),
    btnTranscribe: document.getElementById('btn-transcribe'),
    statusTranscribe: document.getElementById('transcribe-status'),
    
    uploadInput: document.getElementById('audio-upload'),
    transcriptOut: document.getElementById('transcript-output')
  };

  let currentBlob = null;

  const recorder = new MeetingRecorder({
    onTimerUpdate: (ms) => {
      const m = Math.floor(ms / 60000).toString().padStart(2, '0');
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      els.timer.textContent = `${m}:${s}`;
    },
    onError: (e) => els.statusRec.textContent = `❌ ${e.message}`
  });

  // 1. RECORDING FLOW
  els.btnRec.onclick = async () => {
    await recorder.start();
    els.btnRec.disabled = true; els.btnPause.disabled = false; els.btnStop.disabled = false;
    els.btnResume.style.display = 'none';
    els.playerSection.style.display = 'none'; // Hide player while recording
    els.statusRec.textContent = ' Recording...';
  };

  els.btnPause.onclick = () => {
    recorder.pause();
    els.btnPause.style.display = 'none'; els.btnResume.style.display = 'inline-block';
    els.statusRec.textContent = '⏸ Paused';
  };

  els.btnResume.onclick = async () => {
    await recorder.resume();
    els.btnResume.style.display = 'none'; els.btnPause.style.display = 'inline-block';
    els.statusRec.textContent = '🔴 Recording...';
  };

  els.btnStop.onclick = async () => {
    const result = recorder.stop();
    if (result) {
      currentBlob = result.blob;
      
      // Setup Player
      const url = URL.createObjectURL(result.blob);
      els.audioPlayer.src = url;
      els.playerSection.style.display = 'block'; // SHOW PLAYER HERE
      
      els.statusRec.textContent = `✅ Saved: ${(result.duration/1000).toFixed(1)}s | ${(result.blob.size/1024).toFixed(1)}KB`;
      els.statusTranscribe.textContent = "Ready to transcribe.";
      els.transcriptOut.textContent = "Click button below to start AI...";
      
      // Auto download for testing
      const a = document.createElement('a'); a.href = url; a.download = `meeting-${Date.now()}.m4a`; a.click();
    }
    els.btnRec.disabled = false; els.btnPause.disabled = true; els.btnStop.disabled = true;
    els.btnPause.style.display = 'inline-block'; els.btnResume.style.display = 'none';
  };

  // 2. UPLOAD FLOW
  els.uploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentBlob = file;
    els.audioPlayer.src = URL.createObjectURL(file);
    els.playerSection.style.display = 'block';
    els.statusTranscribe.textContent = "File loaded.";
  };

  // 3. TRANSCRIPTION FLOW (With WAV Conversion Fix)
  els.btnTranscribe.onclick = async () => {
    if (!currentBlob) return alert("No audio found!");
    
    els.btnTranscribe.disabled = true;
    els.statusTranscribe.textContent = "⏳ Converting audio format...";
    
    try {
      // STEP A: Convert to WAV (Crucial for iOS compatibility)
      const wavBlob = await convertBlobToWav(currentBlob);
      
      // STEP B: Load Model
      els.statusTranscribe.textContent = "⏳ Loading AI Model (First time ~50MB)...";
      if (!window.transformers) throw new Error("Library not loaded. Check internet.");
      
      const { pipeline } = window.transformers;
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
      
      // STEP C: Transcribe
      els.statusTranscribe.textContent = "🔄 Transcribing... Please wait.";
      const output = await transcriber(wavBlob, { chunk_length_s: 30.0 });
      
      els.transcriptOut.textContent = output.text || "(No speech detected)";
      els.statusTranscribe.textContent = "✅ Done!";
      
    } catch (err) {
      console.error(err);
      els.transcriptOut.textContent = `❌ ERROR: ${err.message}`;
      els.statusTranscribe.textContent = "Failed. Check console (F12).";
    } finally {
      els.btnTranscribe.disabled = false;
    }
  };
});