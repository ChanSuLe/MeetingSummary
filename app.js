/**
 * Meeting Recorder Logic (Fixed for iOS & Desktop)
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
    this.audioConfig = this._getBestAudioConfig();
  }

  _getBestAudioConfig() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) return { mimeType: 'audio/mp4;codecs=mp4a.40.2', bitsPerSecond: 128000 };
    const codecs = ['audio/webm;codecs=opus', 'audio/webm'];
    for (const codec of codecs) {
      if (MediaRe