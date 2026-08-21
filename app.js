/**
 * Meeting Recorder & Transcriber (iOS Stable Version)
 * NO MANUAL WAV CONVERSION - Let library handle it
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
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.mimeType = isIOS ? 'audio/mp4;codecs=mp4a.40.2' : 'audio/webm;codecs=opus';
  }

  async start() {
    if (this.isRecording && !this.isPaused) return;
    try {
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

// --- MAIN APP LOGIC (NO WAV CONVERSION) ---
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

  let currentAudioBlob = null; // Store original blob (m4a/webm)

  const recorder = new MeetingRecorder({
    onTimerUpdate: (ms) => {
      const m = Math.floor(ms / 60000).toString().padStart(2, '0');
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      els.timer.textContent = `${m}:${s}`;
    },
    onError: (e) => els.statusRec.textContent = ` ${e.message}`
  });

  // 1. RECORDING FLOW
  els.btnRec.onclick = async () => {
    await recorder.start();
    els.btnRec.disabled = true; els.btnPause.disabled = false; els.btnStop.disabled = false;
    els.btnResume.style.display = 'none';
    els.playerSection.style.display = 'none';
    els.statusRec.textContent = '🔴 Recording...';
  };

  els.btnPause.onclick = () => {
    recorder.pause();
    els.btnPause.style.display = 'none'; els.btnResume.style.display = 'inline-block';
    els.statusRec.textContent = ' Paused';
  };

  els.btnResume.onclick = async () => {
    await recorder.resume();
    els.btnResume.style.display = 'none'; els.btnPause.style.display = 'inline-block';
    els.statusRec.textContent = '🔴 Recording...';
  };

  els.btnStop.onclick = () => {
    const result = recorder.stop();
    if (result) {
      currentAudioBlob = result.blob;
      
      // Use ORIGINAL blob for playback (Safari supports .m4a natively)
      const url = URL.createObjectURL(result.blob);
      els.audioPlayer.src = url;
      els.playerSection.style.display = 'block';
      
      els.statusRec.textContent = `✅ Saved: ${(result.duration/1000).toFixed(1)}s | Ready to play`;
      els.statusTranscribe.textContent = "Click Transcribe to start AI.";
      els.transcriptOut.textContent = "Waiting for transcription...";
    }
    els.btnRec.disabled = false; els.btnPause.disabled = true; els.btnStop.disabled = true;
    els.btnPause.style.display = 'inline-block'; els.btnResume.style.display = 'none';
  };

  // 2. UPLOAD FLOW
  els.uploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentAudioBlob = file;
    els.audioPlayer.src = URL.createObjectURL(file);
    els.playerSection.style.display = 'block';
    els.statusTranscribe.textContent = "File ready.";
  };

  // 3. TRANSCRIPTION FLOW (Pass blob directly to Whisper)
  els.btnTranscribe.onclick = async () => {
    if (!currentAudioBlob) return alert("No audio found!");
    
    els.btnTranscribe.disabled = true;
    els.statusTranscribe.textContent = "⏳ Loading AI Model (~50MB)...";
    
    try {
      if (!window.transformers) throw new Error("Library not loaded.");
      
      const { pipeline } = window.transformers;
      // whisper-tiny handles m4a/webm internally via FFmpeg WASM
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
      
      els.statusTranscribe.textContent = "🔄 Transcribing...";
      
      // Pass blob directly - library will decode internally
      const output = await transcriber(currentAudioBlob, { 
        chunk_length_s: 30.0,
        language: undefined // Auto-detect ID/EN/ZH
      });
      
      els.transcriptOut.textContent = output.text || "(No speech detected)";
      els.statusTranscribe.textContent = "✅ Done!";
      
    } catch (err) {
      console.error(err);
      els.transcriptOut.textContent = ` ERROR: ${err.message}`;
      els.statusTranscribe.textContent = "Failed. Try shorter audio (<30s).";
    } finally {
      els.btnTranscribe.disabled = false;
    }
  };
});