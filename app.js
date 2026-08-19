(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    startBtn: $("startBtn"),
    pauseBtn: $("pauseBtn"),
    stopBtn: $("stopBtn"),
    timer: $("timer"),
    statusBadge: $("statusBadge"),
    languageSelect: $("languageSelect"),
    summaryLanguageSelect: $("summaryLanguageSelect"),
    recordingInfo: $("recordingInfo"),
    audioPreview: $("audioPreview"),
    audioFile: $("audioFile"),
    fileInfo: $("fileInfo"),
    transcript: $("transcript"),
    speechBtn: $("speechBtn"),
    speechStatus: $("speechStatus"),
    clearTranscriptBtn: $("clearTranscriptBtn"),
    generateBtn: $("generateBtn"),
    summaryOverview: $("summaryOverview"),
    decisionsList: $("decisionsList"),
    actionsList: $("actionsList"),
    exportBtn: $("exportBtn"),
    saveBtn: $("saveBtn"),
    clearAllBtn: $("clearAllBtn")
  };

  const state = {
    stream: null,
    recorder: null,
    chunks: [],
    recordingStartedAt: 0,
    elapsedBeforePause: 0,
    timerId: null,
    audioUrl: null,
    recognition: null,
    recognitionRunning: false,
    transcriptBeforeSpeech: "",
    selectedAudioFile: null
  };

  const STORAGE_KEY = "meetingSummaryDraftV01";

  function setStatus(text, type = "") {
    els.statusBadge.textContent = text;
    els.statusBadge.className = `status-badge ${type}`;
  }

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(
      Math.floor((seconds % 3600) / 60)
    ).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");

    return `${hours}:${minutes}:${secs}`;
  }

  function updateTimer() {
    let elapsed = state.elapsedBeforePause;

    if (state.recordingStartedAt) {
      elapsed += performance.now() - state.recordingStartedAt;
    }

    els.timer.textContent = formatTime(elapsed / 1000);
  }

  function startTimer() {
    stopTimer();
    state.recordingStartedAt = performance.now();
    state.timerId = window.setInterval(updateTimer, 500);
  }

  function pauseTimer() {
    if (state.recordingStartedAt) {
      state.elapsedBeforePause +=
        performance.now() - state.recordingStartedAt;
      state.recordingStartedAt = 0;
    }

    updateTimer();
  }

  function stopTimer() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function resetTimer() {
    stopTimer();
    state.recordingStartedAt = 0;
    state.elapsedBeforePause = 0;
    els.timer.textContent = "00:00:00";
  }

  function chooseMimeType() {
    if (
      !window.MediaRecorder ||
      typeof MediaRecorder.isTypeSupported !== "function"
    ) {
      return "";
    }

    const candidates = [
      "audio/mp4",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/webm;codecs=opus",
      "audio/webm"
    ];

    return (
      candidates.find((type) =>
        MediaRecorder.isTypeSupported(type)
      ) || ""
    );
  }

  function stopStream() {
    if (!state.stream) {
      return;
    }

    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  function revokeAudioUrl() {
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = null;
    }
  }

  function showRecordingInfo(message) {
    els.recordingInfo.hidden = false;
    els.recordingInfo.textContent = message;
  }

  async function startRecording() {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setStatus("Microphone unavailable");
      showRecordingInfo(
        "This browser does not support microphone recording."
      );
      return;
    }

    if (!window.MediaRecorder) {
      setStatus("Recorder unavailable");
      showRecordingInfo(
        "MediaRecorder is not available in this browser."
      );
      return;
    }

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mimeType = chooseMimeType();

      state.chunks = [];

      state.recorder = mimeType
        ? new MediaRecorder(state.stream, { mimeType })
        : new MediaRecorder(state.stream);

      state.recorder.addEventListener(
        "dataavailable",
        (event) => {
          if (event.data && event.data.size > 0) {
            state.chunks.push(event.data);
          }
        }
      );

      state.recorder.addEventListener(
        "stop",
        finishRecording
      );

      state.recorder.addEventListener("error", (event) => {
        console.error("MediaRecorder error:", event.error || event);

        setStatus("Recording error");

        showRecordingInfo(
          "The browser reported a recording error."
        );
      });

      state.recorder.start(1000);

      startTimer();

      els.startBtn.disabled = true;
      els.pauseBtn.disabled = false;
      els.stopBtn.disabled = false;

      setStatus("Recording", "recording");

      showRecordingInfo(
        "Recording is active. Keep this page open while recording."
      );
    } catch (error) {
      console.error(error);

      stopStream();

      if (
        error &&
        error.name === "NotAllowedError"
      ) {
        showRecordingInfo(
          "Microphone permission was denied. Allow microphone access for this site and try again."
        );
      } else {
        showRecordingInfo(
          `Unable to start recording: ${
            error.message || "Unknown error"
          }`
        );
      }

      setStatus("Ready");
    }
  }

  function pauseRecording() {
    if (!state.recorder) {
      return;
    }

    if (state.recorder.state === "recording") {
      state.recorder.pause();

      pauseTimer();

      els.pauseBtn.textContent = "Resume";

      setStatus("Paused", "paused");

      showRecordingInfo("Recording is paused.");
    } else if (state.recorder.state === "paused") {
      state.recorder.resume();

      startTimer();

      els.pauseBtn.textContent = "Pause";

      setStatus("Recording", "recording");

      showRecordingInfo("Recording resumed.");
    }
  }

  function stopRecording() {
    if (!state.recorder) {
      return;
    }

    if (state.recorder.state !== "inactive") {
      state.recorder.stop();
    }
  }

  function finishRecording() {
    stopTimer();
    pauseTimer();
    stopStream();

    const type =
      state.recorder?.mimeType || "audio/webm";

    const blob = new Blob(state.chunks, { type });

    revokeAudioUrl();

    if (blob.size > 0) {
      state.audioUrl = URL.createObjectURL(blob);

      els.audioPreview.src = state.audioUrl;
      els.audioPreview.hidden = false;

      const sizeMb = (
        blob.size /
        (1024 * 1024)
      ).toFixed(2);

      showRecordingInfo(
        `Recording captured: ${sizeMb} MB`
      );
    } else {
      showRecordingInfo(
        "The recording contained no audio data."
      );
    }

    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.stopBtn.disabled = true;

    els.pauseBtn.textContent = "Pause";

    setStatus("Recorded", "saved");

    state.recorder = null;
  }

  function handleAudioFile(event) {
    const file =
      event.target.files &&
      event.target.files[0];

    state.selectedAudioFile = file || null;

    if (!file) {
      els.fileInfo.hidden = true;
      return;
    }

    const sizeMb = (
      file.size /
      (1024 * 1024)
    ).toFixed(2);

    els.fileInfo.hidden = false;

    els.fileInfo.textContent =
      `${file.name} • ${sizeMb} MB • ${
        file.type || "Audio format"
      }`;

    revokeAudioUrl();

    state.audioUrl = URL.createObjectURL(file);

    els.audioPreview.src = state.audioUrl;
    els.audioPreview.hidden = false;

    setStatus("Audio selected", "saved");
  }

  function getSpeechRecognition() {
    return (
      window.SpeechRecognition ||
      window.webkitSpeechRecognition ||
      null
    );
  }

  function setupSpeechRecognition() {
    const SpeechRecognitionCtor =
      getSpeechRecognition();

    if (!SpeechRecognitionCtor) {
      els.speechBtn.disabled = true;
      els.speechStatus.textContent =
        "Not supported";

      return null;
    }

    const recognition =
      new SpeechRecognitionCtor();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.recognitionRunning = true;

      els.speechBtn.textContent =
        "Stop Browser Transcription";

      els.speechStatus.textContent =
        "Listening";
    };

    recognition.onend = () => {
      state.recognitionRunning = false;

      els.speechBtn.textContent =
        "Start Browser Transcription";

      els.speechStatus.textContent =
        "Stopped";
    };

    recognition.onerror = (event) => {
      console.warn(
        "Speech recognition error:",
        event.error
      );

      state.recognitionRunning = false;

      els.speechBtn.textContent =
        "Start Browser Transcription";

      els.speechStatus.textContent =
        `Error: ${event.error || "unknown"}`;
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        const result = event.results[i];

        const text =
          result[0]?.transcript || "";

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      const existing =
        state.transcriptBeforeSpeech.trim();

      const addition =
        finalText.trim();

      if (addition) {
        state.transcriptBeforeSpeech =
          `${existing}${
            existing ? "\n" : ""
          }${addition}`.trim();
      }

      els.transcript.value =
        `${state.transcriptBeforeSpeech}${
          interimText
            ? `\n${interimText}`
            : ""
        }`.trim();
    };

    return recognition;
  }

  function toggleSpeechRecognition() {
    if (!state.recognition) {
      state.recognition =
        setupSpeechRecognition();
    }

    if (!state.recognition) {
      return;
    }

    state.recognition.lang =
      els.languageSelect.value;

    if (state.recognitionRunning) {
      state.recognition.stop();
      return;
    }

    state.transcriptBeforeSpeech =
      els.transcript.value.trim();

    try {
      state.recognition.start();
    } catch (error) {
      console.warn(
        "Speech recognition start failed:",
        error
      );
    }
  }

  function cleanSentences(text) {
    return text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?。！？])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function extractByKeywords(
    sentences,
    patterns
  ) {
    return sentences.filter((sentence) =>
      patterns.some((pattern) =>
        pattern.test(sentence)
      )
    );
  }

  function unique(items) {
    return [...new Set(items)];
  }

  function generateLocalSummary(text) {
    const sentences =
      cleanSentences(text);

    if (!sentences.length) {
      return {
        overview: "No transcript available.",
        decisions: [],
        actions: []
      };
    }

    const decisionPatterns = [
      /\bdecid(ed|e|ision)?\b/i,
      /\bagree(d)?\b/i,
      /\bapproved?\b/i,
      /\bconfirmed?\b/i,
      /\bkeputusan\b/i,
      /\bsepakat\b/i,
      /\bdisetujui\b/i,
      /\bditetapkan\b/i,
      /keputusannya/i,
      /同意/,
      /决定/,
      /确认/
    ];

    const actionPatterns = [
      /\baction\b/i,
      /\baction item\b/i,
      /\bto-do\b/i,
      /\bnext step\b/i,
      /\bfollow[- ]?up\b/i,
      /\bwill\b/i,
      /\bneed to\b/i,
      /\bmust\b/i,
      /\bakan\b/i,
      /\bharus\b/i,
      /\bperlu\b/i,
      /\btindak lanjut\b/i,
      /需要/,
      /必须/
    ];

    const decisions = unique(
      extractByKeywords(
        sentences,
        decisionPatterns
      )
    ).slice(0, 8);

    const actions = unique(
      extractByKeywords(
        sentences,
        actionPatterns
      )
    ).slice(0, 8);

    return {
      overview: sentences
        .slice(0, 4)
        .join(" "),
      decisions,
      actions
    };
  }

  function renderList(
    element,
    items,
    emptyText
  ) {
    element.innerHTML = "";

    if (!items.length) {
      const li =
        document.createElement("li");

      li.textContent = emptyText;

      element.appendChild(li);

      return;
    }

    items.forEach((item) => {
      const li =
        document.createElement("li");

      li.textContent = item;

      element.appendChild(li);
    });
  }

  function generateSummary() {
    const text =
      els.transcript.value.trim();

    if (!text) {
      els.summaryOverview.textContent =
        "Add a transcript first.";

      renderList(
        els.decisionsList,
        [],
        "No decisions extracted yet."
      );

      renderList(
        els.actionsList,
        [],
        "No action items extracted yet."
      );

      return;
    }

    const result =
      generateLocalSummary(text);

    els.summaryOverview.textContent =
      result.overview;

    renderList(
      els.decisionsList,
      result.decisions,
      "No decision keywords were detected."
    );

    renderList(
      els.actionsList,
      result.actions,
      "No action-item keywords were detected."
    );

    setStatus(
      "Summary generated",
      "saved"
    );
  }

  function buildDraft() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      language:
        els.languageSelect.value,
      summaryLanguage:
        els.summaryLanguageSelect.value,
      transcript:
        els.transcript.value,
      overview:
        els.summaryOverview.textContent,
      decisions:
        [...els.decisionsList.querySelectorAll("li")]
          .map((li) => li.textContent),
      actions:
        [...els.actionsList.querySelectorAll("li")]
          .map((li) => li.textContent)
    };
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(buildDraft())
      );

      setStatus(
        "Draft saved",
        "saved"
      );
    } catch (error) {
      console.error(error);

      setStatus("Save failed");

      alert(
        "Unable to save the draft in this browser."
      );
    }
  }

  function loadDraft() {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return;
      }

      const draft =
        JSON.parse(raw);

      if (!draft || typeof draft !== "object") {
        return;
      }

      if (draft.language) {
        els.languageSelect.value =
          draft.language;
      }

      if (draft.summaryLanguage) {
        els.summaryLanguageSelect.value =
          draft.summaryLanguage;
      }

      if (
        typeof draft.transcript ===
        "string"
      ) {
        els.transcript.value =
          draft.transcript;
      }

      if (
        typeof draft.overview ===
        "string"
      ) {
        els.summaryOverview.textContent =
          draft.overview;
      }

      if (Array.isArray(draft.decisions)) {
        renderList(
          els.decisionsList,
          draft.decisions,
          "No decisions."
        );
      }

      if (Array.isArray(draft.actions)) {
        renderList(
          els.actionsList,
          draft.actions,
          "No action items."
        );
      }

      setStatus(
        "Draft restored",
        "saved"
      );
    } catch (error) {
      console.warn(
        "Could not restore draft:",
        error
      );
    }
  }

  function exportMeeting() {
    const now = new Date();

    const decisions =
      [
        ...els.decisionsList.querySelectorAll(
          "li"
        )
      ]
        .map(
          (li) => `- ${li.textContent}`
        )
        .join("\n");

    const actions =
      [
        ...els.actionsList.querySelectorAll(
          "li"
        )
      ]
        .map(
          (li) => `- ${li.textContent}`
        )
        .join("\n");

    const content = [
      "MEETINGSUMMARY",
      "================",
      `Date: ${now.toLocaleString()}`,
      "",
      "OVERVIEW",
      "--------",
      els.summaryOverview.textContent ||
        "No summary.",
      "",
      "KEY DECISIONS",
      "-------------",
      decisions || "- None",
      "",
      "ACTION ITEMS",
      "------------",
      actions || "- None",
      "",
      "TRANSCRIPT",
      "----------",
      els.transcript.value ||
        "No transcript."
    ].join("\n");

    const blob = new Blob(
      [content],
      {
        type:
          "text/plain;charset=utf-8"
      }
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;

    anchor.download =
      `MeetingSummary-${
        now.toISOString().slice(0, 10)
      }.txt`;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

    setStatus(
      "Exported",
      "saved"
    );
  }

  function clearTranscript() {
    els.transcript.value = "";

    state.transcriptBeforeSpeech = "";

    setStatus("Transcript cleared");
  }

  function clearMeeting() {
    const confirmed =
      window.confirm(
        "Clear the current transcript, summary, and saved draft?"
      );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(
      STORAGE_KEY
    );

    els.transcript.value = "";

    els.summaryOverview.textContent =
      "No summary yet.";

    renderList(
      els.decisionsList,
      [],
      "No decisions extracted yet."
    );

    renderList(
      els.actionsList,
      [],
      "No action items extracted yet."
    );

    els.audioFile.value = "";

    state.selectedAudioFile = null;

    revokeAudioUrl();

    els.audioPreview.removeAttribute(
      "src"
    );

    els.audioPreview.hidden = true;

    els.fileInfo.hidden = true;

    els.recordingInfo.hidden = true;

    resetTimer();

    setStatus("Ready");
  }

  els.startBtn.addEventListener(
    "click",
    startRecording
  );

  els.pauseBtn.addEventListener(
    "click",
    pauseRecording
  );

  els.stopBtn.addEventListener(
    "click",
    stopRecording
  );

  els.audioFile.addEventListener(
    "change",
    handleAudioFile
  );

  els.speechBtn.addEventListener(
    "click",
    toggleSpeechRecognition
  );

  els.generateBtn.addEventListener(
    "click",
    generateSummary
  );

  els.clearTranscriptBtn.addEventListener(
    "click",
    clearTranscript
  );

  els.exportBtn.addEventListener(
    "click",
    exportMeeting
  );

  els.saveBtn.addEventListener(
    "click",
    saveDraft
  );

  els.clearAllBtn.addEventListener(
    "click",
    clearMeeting
  );

  els.languageSelect.addEventListener(
    "change",
    () => {
      if (
        state.recognitionRunning &&
        state.recognition
      ) {
        state.recognition.stop();

        window.setTimeout(() => {
          state.recognition.lang =
            els.languageSelect.value;

          try {
            state.recognition.start();
          } catch (error) {
            console.warn(error);
          }
        }, 150);
      }
    }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      stopTimer();
      stopStream();
      revokeAudioUrl();
    }
  );

  state.recognition =
    setupSpeechRecognition();

  loadDraft();
})();