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
      
      this