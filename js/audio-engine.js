class AudioEngine {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.startTime = null;
    this.pausedTime = 0;
    this.isRecording = false;
    this.isPaused = false;
    this.timerInterval = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
  }

  async checkStorage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const remaining = estimate.quota - estimate.usage;
      return remaining > 500 * 1024 * 1024; // 500MB minimum
    }
    return true;
  }

  async startRecording() {
    const hasStorage = await this.checkStorage();
    if (!hasStorage) throw new Error('Storage full');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    });

    this.audioChunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    // Visualizer
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(this.stream);
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.mediaRecorder.start(1000); // Collect every 1 second
    this.startTime = Date.now();
    this.isRecording = true;
    this.isPaused = false;
    this.startTimer();
    this.startVisualizer();
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return;
    this.mediaRecorder.pause();
    this.pausedTime += Date.now() - this.startTime;
    this.isPaused = true;
    this.stopTimer();
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;
    this.mediaRecorder.resume();
    this.startTime = Date.now();
    this.isPaused = false;
    this.startTimer();
  }

  async stopRecording() {
    if (!this.isRecording) return null;
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
        this.cleanup();
        resolve(blob);
      };
      this.mediaRecorder.stop();
      this.stream.getTracks().forEach(t => t.stop());
    });
  }

  cleanup() {
    this.isRecording = false;
    this.isPaused = false;
    this.stopTimer();
    this.stopVisualizer();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      const elapsed = this.isPaused ? this.pausedTime : (Date.now() - this.startTime + this.pausedTime);
      const formatted = this.formatTime(elapsed);
      document.getElementById('recording-timer').textContent = formatted;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  }

  startVisualizer() {
    const canvas = document.getElementById('audio-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const draw = () => {
      if (!this.isRecording || !this.analyser) return;
      this.animationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(this.dataArray);

      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--card').trim() || '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / this.dataArray.length;
      for (let i = 0; i < this.dataArray.length; i++) {
        const barHeight = (this.dataArray[i] / 255) * canvas.height * 0.8;
        ctx.fillStyle = '#0A84FF';
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 1, barHeight);
      }
    };
    draw();
  }

  stopVisualizer() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  getDuration() {
    if (!this.startTime) return 0;
    return this.isPaused ? this.pausedTime : (Date.now() - this.startTime + this.pausedTime);
  }
}
