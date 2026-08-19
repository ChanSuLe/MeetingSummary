// Main App Controller
const App = {
  storage: new StorageEngine(),
  audio: new AudioEngine(),
  ai: new AIEngine(),
  export: new ExportEngine(),
  currentMeeting: null,
  currentSegments: [],

  async init() {
    await this.storage.init();
    this.setupNavigation();
    this.setupEventListeners();
    this.loadMeetings();
    this.updateStorageInfo();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(console.error);
    }
  },

  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        this.showScreen(screen);
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  setupEventListeners() {
    // Home
    document.getElementById('btn-new-meeting').addEventListener('click', () => this.showScreen('new-meeting-screen'));
    
    // Back buttons
    document.getElementById('btn-back-home').addEventListener('click', () => this.showScreen('home-screen'));
    document.getElementById('btn-back-home-2').addEventListener('click', () => { this.currentMeeting = null; this.showScreen('home-screen'); this.loadMeetings(); });
    document.getElementById('btn-back-summary').addEventListener('click', () => this.showScreen('summary-screen'));
    document.getElementById('btn-close-settings').addEventListener('click', () => this.showScreen('home-screen'));
    
    // New meeting
    document.getElementById('btn-add-participant').addEventListener('click', () => this.addParticipant());
    document.getElementById('btn-start-recording').addEventListener('click', () => this.startRecording());
    
    // Recording
    document.getElementById('btn-pause-resume').addEventListener('click', () => this.togglePauseResume());
    document.getElementById('btn-stop-recording').addEventListener('click', () => this.stopRecording());
    
    // Markers
    document.querySelectorAll('.marker-btn').forEach(btn => {
      btn.addEventListener('click', () => this.addMarker(btn.dataset.type));
    });
    
    // Filters
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadMeetings(btn.dataset.filter);
      });
    });
    
    // Export
    document.querySelectorAll('.btn-export').forEach(btn => {
      btn.addEventListener('click', () => this.exportMeeting(btn.dataset.format));
    });
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.hidden = true);
    document.getElementById(id).hidden = false;
    window.scrollTo(0, 0);
  },

  addParticipant() {
    const input = document.querySelector('.participant-input');
    const name = input.value.trim();
    if (!name) return;
    
    const list = document.getElementById('participants-list');
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `${name} <button onclick="this.parentElement.remove()">×</button>`;
    list.appendChild(tag);
    input.value = '';
  },

  getParticipants() {
    return Array.from(document.querySelectorAll('#participants-list .tag'))
      .map(t => t.textContent.replace('×', '').trim());
  },

  getLanguages() {
    return Array.from(document.querySelectorAll('.checkbox input:checked'))
      .map(cb => cb.value);
  },

  async startRecording() {
    const title = document.getElementById('meeting-title').value.trim();
    if (!title) {
      alert('Please enter a meeting title');
      return;
    }
    
    this.currentMeeting = {
      id: crypto.randomUUID(),
      title,
      meetingType: document.getElementById('meeting-type').value,
      date: new Date().toISOString(),
      duration: 0,
      languages: this.getLanguages(),
      participants: this.getParticipants(),
      agenda: document.getElementById('meeting-agenda').value,
      transcript: '',
      summary: null,
      actionItems: [],
      bookmarks: [],
      markers: [],
      processingStatus: 'Recording',
      audioBlob: null
    };
    
    try {
      await this.audio.startRecording();
      this.showScreen('recording-screen');
      document.getElementById('recording-status-text').textContent = 'RECORDING';
      document.getElementById('recording-dot').style.animation = 'pulse 1.5s infinite';
      document.getElementById('btn-pause-resume').textContent = 'Pause';
      
      // Simulate live transcript
      this.simulateLiveTranscript();
      
    } catch (err) {
      alert('Microphone access required: ' + err.message);
    }
  },

  simulateLiveTranscript() {
    const samples = [
      { text: "Okay, let's start today's meeting.", speaker: "Speaker 1" },
      { text: "I want to discuss the manpower plan.", speaker: "Speaker 2" },
      { text: "I think we need about 120 people for the first phase.", speaker: "Speaker 1" },
      { text: "Wait, is 120 enough for our timeline?", speaker: "Speaker 3" },
      { text: "After reviewing, we agree on 180 employees.", speaker: "Speaker 2" },
      { text: "Michael, please prepare the proposal by Friday.", speaker: "Speaker 1" }
    ];
    
    let i = 0;
    const interval = setInterval(() => {
      if (!this.audio.isRecording) {
        clearInterval(interval);
        return;
      }
      if (i < samples.length && !this.audio.isPaused) {
        const sample = samples[i];
        const time = this.audio.getDuration();
        this.currentSegments.push({
          id: crypto.randomUUID(),
          startTime: time,
          endTime: time + 5000,
          text: sample.text,
          speaker: sample.speaker,
          language: this.currentMeeting.languages[0]
        });
        this.appendLiveTranscript(sample, time);
        i++;
      }
    }, 5000);
  },

  appendLiveTranscript(sample, time) {
    const container = document.getElementById('live-transcript');
    const div = document.createElement('div');
    div.className = 'transcript-segment';
    div.innerHTML = `
      <div class="segment-speaker">${sample.speaker}</div>
      <div class="segment-text">${sample.text}</div>
      <div class="segment-time">${this.formatTime(time)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  togglePauseResume() {
    const btn = document.getElementById('btn-pause-resume');
    if (this.audio.isPaused) {
      this.audio.resumeRecording();
      btn.textContent = 'Pause';
      document.getElementById('recording-status-text').textContent = 'RECORDING';
      document.getElementById('recording-dot').style.animation = 'pulse 1.5s infinite';
    } else {
      this.audio.pauseRecording();
      btn.textContent = 'Resume';
      document.getElementById('recording-status-text').textContent = 'PAUSED';
      document.getElementById('recording-dot').style.animation = 'none';
    }
  },

  async stopRecording() {
    const blob = await this.audio.stopRecording();
    this.currentMeeting.audioBlob = blob;
    this.currentMeeting.duration = this.audio.getDuration();
    this.currentMeeting.processingStatus = 'Transcribing';
    
    await this.storage.saveMeeting(this.currentMeeting);
    
    this.showScreen('summary-screen');
    document.getElementById('processing-indicator').hidden = false;
    document.getElementById('summary-content').innerHTML = '';
    
    // Process transcript
    setTimeout(() => this.processMeeting(), 1500);
  },

  async processMeeting() {
    // Build full transcript
    this.currentMeeting.transcript = this.currentSegments.map(s => 
      `[${s.speaker}] ${this.formatTime(s.startTime)}: ${s.text}`
    ).join('\n');
    
    this.currentMeeting.processingStatus = 'Analyzing';
    await this.storage.saveMeeting(this.currentMeeting);
    
    // AI Analysis
    const summary = this.ai.analyzeMeeting(
      this.currentMeeting.transcript,
      this.currentSegments,
      document.getElementById('setting-language').value || 'English'
    );
    
    this.currentMeeting.summary = summary;
    this.currentMeeting.actionItems = summary.actionItems;
    this.currentMeeting.processingStatus = 'Completed';
    
    await this.storage.saveMeeting(this.currentMeeting);
    
    document.getElementById('processing-indicator').hidden = true;
    this.renderSummary();
  },

  renderSummary() {
    const meeting = this.currentMeeting;
    const container = document.getElementById('summary-content');
    
    let html = '';
    
    if (meeting.summary) {
      html += `<div class="summary-section">
        <h3>Executive Summary</h3>
        <div class="summary-text">${meeting.summary.executiveSummary.replace(/\n/g, '<br>')}</div>
      </div>`;
      
      if (meeting.summary.decisions.length) {
        html += `<div class="summary-section"><h3>Decisions</h3>`;
        meeting.summary.decisions.forEach(d => {
          html += `<div class="decision-item">
            <div class="decision-header">
              <span class="decision-title">${d.title}</span>
              <span class="decision-confidence conf-${d.confidence.toLowerCase().replace(' ', '-')}">${d.confidence}</span>
            </div>
            <div class="decision-desc">${d.description}</div>
            <div class="decision-evidence">Evidence: ${this.formatTime(d.evidence.timestamp)}</div>
          </div>`;
        });
        html += `</div>`;
      }
      
      if (meeting.summary.actionItems.length) {
        html += `<div class="summary-section"><h3>Action Plan</h3>`;
        meeting.summary.actionItems.forEach(item => {
          html += `<div class="action-item">
            <div class="action-status status-${item.status.toLowerCase().replace(' ', '-')}-dot"></div>
            <div class="action-details">
              <div class="action-task">${item.task}</div>
              <div class="action-meta">PIC: ${item.pic}${item.deadline ? ' | Deadline: ' + item.deadline : ''}</div>
            </div>
          </div>`;
        });
        html += `</div>`;
      }
      
      if (meeting.summary.risks.length) {
        html += `<div class="summary-section"><h3>Risks & Concerns</h3>`;
        meeting.summary.risks.forEach(r => {
          html += `<div class="risk-item risk-${r.severity.toLowerCase()}">${r.description}</div>`;
        });
        html += `</div>`;
      }
    }
    
    container.innerHTML = html;
  },

  async loadMeetings(filter = 'all') {
    const meetings = await this.storage.getMeetings();
    const container = document.getElementById('meetings-list');
    container.innerHTML = '';
    
    let filtered = meetings;
    if (filter === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filtered = meetings.filter(m => new Date(m.date) >= weekAgo);
    } else if (filter === 'action') {
      filtered = meetings.filter(m => m.actionItems?.some(a => a.status === 'Pending'));
    }
    
    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">No meetings yet.<br>Tap "New Meeting" to start.</div>';
      return;
    }
    
    filtered.forEach(m => {
      const card = document.createElement('div');
      card.className = 'meeting-card';
      card.innerHTML = `
        <h4>${m.title}</h4>
        <div class="meeting-meta">
          <span>${new Date(m.date).toLocaleDateString()}</span>
          <span>${this.formatDuration(m.duration || 0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="languages-tag">${m.languages.join(' + ')}</span>
          <span class="status-badge status-${m.processingStatus.toLowerCase().replace(' ', '-')}">${m.processingStatus}</span>
        </div>
      `;
      card.addEventListener('click', () => this.openMeeting(m.id));
      container.appendChild(card);
    });
  },

  async openMeeting(id) {
    this.currentMeeting = await this.storage.getMeeting(id);
    if (!this.currentMeeting) return;
    
    this.currentSegments = []; // Would be stored in real implementation
    this.showScreen('summary-screen');
    document.getElementById('processing-indicator').hidden = true;
    this.renderSummary();
  },

  exportMeeting(format) {
    if (!this.currentMeeting) return;
    if (format === 'pdf') this.export.exportToPDF(this.currentMeeting);
    else if (format === 'md') this.export.exportToMarkdown(this.currentMeeting);
    else if (format === 'txt') this.export.exportToText(this.currentMeeting);
  },

  addMarker(type) {
    if (!this.currentMeeting || !this.audio.isRecording) return;
    const time = this.audio.getDuration();
    this.currentMeeting.markers.push({
      id: crypto.randomUUID(),
      timestamp: time,
      type,
      note: null,
      createdAt: new Date().toISOString()
    });
    // Visual feedback
    const btn = document.querySelector(`.marker-btn[data-type="${type}"]`);
    btn.style.transform = 'scale(0.9)';
    setTimeout(() => btn.style.transform = 'scale(1)', 150);
  },

  async updateStorageInfo() {
    const info = await this.storage.getStorageInfo();
    const el = document.getElementById('storage-info');
    if (el) el.textContent = info;
  },

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },

  formatDuration(ms) {
    return this.formatTime(ms);
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
