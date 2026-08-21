// app.js - Meeting Recorder Logic (Fixed for iOS Silent Recording)

class MeetingRecorder {
  constructor(options = {}) {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    
    // Timer State
    this.startTime = null;
    this.elapsedBeforePause = 0;
    this.isRecording = false;
    this.isPaused = false;
    this.timerRAF = null;
    
    // Callbacks
    this.onDataAvailable = options.onDataAvailable || (() => {});
    this.onTimerUpdate = options.onTimerUpdate || (() => {});
    this.onError = options.onError || ((e) => console.error(e));
    
    this.audioConfig = this._getBestAudioConfig();
  }

  _getBestAudioConfig() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) return { mimeType: 'audio/mp4;codecs=mp4a.40.2', bitsPerSecond: 128000 };
    
    const codecs = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) return { mimeType: codec, bitsPerSecond: 128000 };
    }
    return { mimeType: '', bitsPerSecond: 128000 };
  }

  async start() {
    if (this.isRecording && !this.isPaused) return;
    try {
      // FIX: Activate AudioContext to unlock audio on iOS
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        await ctx.resume();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true, 
          sampleRate: 44100,
          channelCount: 1 // Force mono for better compatibility
        }
      });
      
      this.recorder = new MediaRecorder(this.stream, this.audioConfig);
      this.chunks = [];
      
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          this.onDataAvailable(e.data);
        }
      };
      
      this.recorder.onerror = (e) => this.onError(e);
      this.recorder.start(1000);
      
      this.startTime = performance.now();
      this.isRecording = true;
      this.isPaused = false;
      this._startTimerLoop();
    } catch (err) {
      this.onError(err);
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.recorder.stop();
    this.stream.getTracks().forEach(t => t.stop());
    this.elapsedBeforePause += performance.now() - this.startTime;
    this.isPaused = true;
    this._stopTimerLoop();
  }

  async resume() {
    if (!this.isRecording || !this.isPaused) return;
    try {
      // Re-activate AudioContext on resume
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        await ctx.resume();
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true, 
          sampleRate: 44100,
          channelCount: 1 
        }
      });
      
      this.recorder = new MediaRecorder(this.stream, this.audioConfig);
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start(1000);
      
      this.startTime = performance.now();
      this.isPaused = false;
      this._startTimerLoop();
    } catch (err) {
      this.onError(err);
    }
  }

  stop() {
    if (!this.isRecording) return null;
    this.recorder.stop();
    this.stream.getTracks().forEach(t => t.stop());
    this._stopTimerLoop();
    
    const finalDuration = this.isPaused 
      ? this.elapsedBeforePause 
      : this.elapsedBeforePause + (performance.now() - this.startTime);
    
    const audioBlob = new Blob(this.chunks, { type: this.audioConfig.mimeType });
    this._resetState();
    
    return { blob: audioBlob, durationMs: finalDuration, mimeType: this.audioConfig.mimeType };
  }

  _startTimerLoop() {
    const tick = () => {
      if (!this.isRecording || this.isPaused) return;
      const currentElapsed = this.elapsedBeforePause + (performance.now() - this.startTime);
      this.onTimerUpdate(currentElapsed);
      this.timerRAF = requestAnimationFrame(tick);
    };
    this.timerRAF = requestAnimationFrame(tick);
  }

  _stopTimerLoop() {
    if (this.timerRAF) { cancelAnimationFrame(this.timerRAF); this.timerRAF = null; }
  }

  _resetState() {
    this.stream = null; this.recorder = null; this.chunks = [];
    this.startTime = null; this.elapsedBeforePause = 0;
    this.isRecording = false; this.isPaused = false;
    this._stopTimerLoop(); this.onTimerUpdate(0);
  }
}

// --- UI Binding ---
document.addEventListener('DOMContentLoaded', () => {
  const timerDisplay = document.getElementById('timer-display');
  const btnRecord = document.getElementById('btn-record');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnStop = document.getElementById('btn-stop');
  const statusLog = document.getElementById('status-log');

  const recorder = new MeetingRecorder({
    onTimerUpdate: (ms) => {
      const mins = Math.floor(ms / 60000).toString().padStart(2, '0');
      const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      timerDisplay.textContent = `${mins}:${secs}`;
    },
    onError: (err) => {
      statusLog.textContent = `❌ Error: ${err.message}`;
      console.error(err);
    },
    onDataAvailable: (chunk) => {
      // Opsional: Tampilkan progress chunk size
      // console.log('Chunk received:', chunk.size);
    }
  });

  btnRecord.addEventListener('click', async () => {
    await recorder.start();
    btnRecord.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnResume.style.display = 'none';
    statusLog.textContent = '🔴 Recording... (Speak now!)';
  });

  btnPause.addEventListener('click', () => {
    recorder.pause();
    btnPause.style.display = 'none';
    btnResume.style.display = 'inline-block';
    btnResume.disabled = false;
    statusLog.textContent = '⏸ Paused';
  });

  btnResume.addEventListener('click', async () => {
    await recorder.resume();
    btnResume.style.display = 'none';
    btnPause.style.display = 'inline-block';
    statusLog.textContent = '🔴 Recording...';
  });

  btnStop.addEventListener('click', () => {
    const result = recorder.stop();
    if (result) {
      statusLog.innerHTML = `✅ Done! Duration: ${(result.durationMs/1000).toFixed(1)}s Size: ${(result.blob.size/1024).toFixed(1)} KB Format: ${result.mimeType}`;
      
      // Auto-download untuk testing
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${Date.now()}.m4a`; 
      a.click();
      URL.revokeObjectURL(url);
    }
    
    btnRecord.disabled = false;
    btnPause.disabled = true;
    btnResume.disabled = true;
    btnStop.disabled = true;
    btnPause.style.display = 'inline-block';
    btnResume.style.display = 'none';
  });
});