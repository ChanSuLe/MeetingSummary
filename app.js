import {
  pipeline,
  env
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1";

"use strict";


/* =========================================================
   CONFIGURATION
========================================================= */

const MODEL_ID = "Xenova/whisper-base";

env.allowLocalModels = false;
env.allowRemoteModels = true;


/* =========================================================
   DOM
========================================================= */

const $ = (id) =>
  document.getElementById(id);


const els = {

  startBtn:
    $("startBtn"),

  pauseBtn:
    $("pauseBtn"),

  stopBtn:
    $("stopBtn"),

  timer:
    $("timer"),

  statusBadge:
    $("statusBadge"),

  recordingInfo:
    $("recordingInfo"),

  audioPreview:
    $("audioPreview"),

  audioFile:
    $("audioFile"),

  fileInfo:
    $("fileInfo"),

  languageSelect:
    $("languageSelect"),

  outputLanguage:
    $("outputLanguage"),

  loadModelBtn:
    $("loadModelBtn"),

  modelStatus:
    $("modelStatus"),

  transcribeBtn:
    $("transcribeBtn"),

  progressBox:
    $("progressBox"),

  progressText:
    $("progressText"),

  progressBar:
    $("progressBar"),

  transcript:
    $("transcript"),

  detectedLanguage:
    $("detectedLanguage"),

  clearTranscriptBtn:
    $("clearTranscriptBtn"),

  summaryLanguageSelect:
    $("summaryLanguageSelect"),

  generateBtn:
    $("generateBtn"),

  summaryOverview:
    $("summaryOverview"),

  decisionsList:
    $("decisionsList"),

  actionsList:
    $("actionsList"),

  saveBtn:
    $("saveBtn"),

  exportBtn:
    $("exportBtn"),

  clearAllBtn:
    $("clearAllBtn")

};


/* =========================================================
   STATE
========================================================= */

const state = {

  stream:
    null,

  recorder:
    null,

  chunks:
    [],

  audioBlob:
    null,

  audioUrl:
    null,

  recorderState:
    "inactive",

  timerStartedAt:
    null,

  accumulatedMs:
    0,

  timerInterval:
    null,

  transcriber:
    null,

  modelLoading:
    false,

  modelReady:
    false

};


/* =========================================================
   STATUS
========================================================= */

function setStatus(
  text,
  type = ""
) {

  els.statusBadge.textContent =
    text;

  els.statusBadge.className =
    `status-badge ${type}`.trim();

}


function info(
  message
) {

  els.recordingInfo.hidden =
    false;

  els.recordingInfo.textContent =
    message;

}


/* =========================================================
   TIMER
========================================================= */

function formatTime(
  seconds
) {

  seconds =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const h =
    String(
      Math.floor(
        seconds / 3600
      )
    ).padStart(
      2,
      "0"
    );

  const m =
    String(
      Math.floor(
        (seconds % 3600) / 60
      )
    ).padStart(
      2,
      "0"
    );

  const s =
    String(
      seconds % 60
    ).padStart(
      2,
      "0"
    );

  return `${h}:${m}:${s}`;

}


function getElapsedMs() {

  if (
    state.timerStartedAt ===
    null
  ) {

    return state.accumulatedMs;

  }

  return (
    state.accumulatedMs +
    performance.now() -
    state.timerStartedAt
  );

}


function updateTimer() {

  els.timer.textContent =
    formatTime(
      getElapsedMs() /
      1000
    );

}


function startTimer() {

  state.timerStartedAt =
    performance.now();

  if (
    state.timerInterval !==
    null
  ) {

    clearInterval(
      state.timerInterval
    );

  }

  state.timerInterval =
    setInterval(
      updateTimer,
      250
    );

  updateTimer();

}


function pauseTimer() {

  if (
    state.timerStartedAt !==
    null
  ) {

    state.accumulatedMs =
      getElapsedMs();

    state.timerStartedAt =
      null;

  }

  if (
    state.timerInterval !==
    null
  ) {

    clearInterval(
      state.timerInterval
    );

  }

  state.timerInterval =
    null;

  updateTimer();

}


function resetTimer() {

  if (
    state.timerInterval !==
    null
  ) {

    clearInterval(
      state.timerInterval
    );

  }

  state.timerInterval =
    null;

  state.timerStartedAt =
    null;

  state.accumulatedMs =
    0;

  els.timer.textContent =
    "00:00:00";

}


/* =========================================================
   AUDIO
========================================================= */

function revokeAudioUrl() {

  if (
    state.audioUrl
  ) {

    URL.revokeObjectURL(
      state.audioUrl
    );

  }

  state.audioUrl =
    null;

}


function stopStream() {

  if (
    !state.stream
  ) {

    return;

  }

  state.stream
    .getTracks()
    .forEach(
      (track) =>
        track.stop()
    );

  state.stream =
    null;

}


function chooseMimeType() {

  if (
    !window.MediaRecorder ||
    typeof MediaRecorder.isTypeSupported !==
      "function"
  ) {

    return "";

  }

  const types = [

    "audio/mp4;codecs=mp4a.40.2",

    "audio/mp4",

    "audio/webm;codecs=opus",

    "audio/webm"

  ];

  return (
    types.find(
      (type) =>
        MediaRecorder.isTypeSupported(
          type
        )
    ) || ""
  );

}


/* =========================================================
   RECORDING
========================================================= */

async function startRecording() {

  resetTimer();

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    setStatus(
      "Microphone unavailable"
    );

    info(
      "This browser does not support microphone recording."
    );

    return;

  }


  try {

    state.stream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: {

            echoCancellation:
              true,

            noiseSuppression:
              true,

            autoGainControl:
              true,

            channelCount:
              1,

            sampleRate:
              48000

          }

        }
      );


    const mimeType =
      chooseMimeType();


    state.chunks =
      [];

    state.audioBlob =
      null;


    state.recorder =
      mimeType

        ? new MediaRecorder(
            state.stream,
            {
              mimeType
            }
          )

        : new MediaRecorder(
            state.stream
          );


    state.recorder.ondataavailable =
      (event) => {

        if (
          event.data &&
          event.data.size > 0
        ) {

          state.chunks.push(
            event.data
          );

        }

      };


    state.recorder.onerror =
      (event) => {

        console.error(
          "MediaRecorder error:",
          event
        );

        setStatus(
          "Recording error"
        );

      };


    state.recorder.onstop =
      finishRecording;


    state.recorder.start(
      1000
    );


    state.recorderState =
      "recording";


    startTimer();


    els.startBtn.disabled =
      true;

    els.pauseBtn.disabled =
      false;

    els.stopBtn.disabled =
      false;


    setStatus(
      "Recording",
      "recording"
    );


    info(
      "Recording is active."
    );

  }

  catch (error) {

    console.error(
      error
    );

    stopStream();

    resetTimer();

    setStatus(
      "Microphone error"
    );

    if (
      error?.name ===
      "NotAllowedError"
    ) {

      info(
        "Microphone permission was denied. Allow microphone access and try again."
      );

    }

    else {

      info(
        error?.message ||
        "Unable to start recording."
      );

    }

  }

}


function pauseRecording() {

  if (
    !state.recorder
  ) {

    return;

  }


  if (
    state.recorderState ===
    "recording"
  ) {

    if (
      state.recorder.state ===
      "recording"
    ) {

      state.recorder.pause();

    }


    pauseTimer();


    state.recorderState =
      "paused";


    els.pauseBtn.textContent =
      "Resume";


    setStatus(
      "Paused",
      "paused"
    );


    info(
      `Recording paused at ${els.timer.textContent}.`
    );

    return;

  }


  if (
    state.recorderState ===
    "paused"
  ) {

    if (
      state.recorder.state ===
      "paused"
    ) {

      state.recorder.resume();

    }


    startTimer();


    state.recorderState =
      "recording";


    els.pauseBtn.textContent =
      "Pause";


    setStatus(
      "Recording",
      "recording"
    );


    info(
      "Recording resumed."
    );

  }

}


function stopRecording() {

  if (
    !state.recorder
  ) {

    return;

  }


  pauseTimer();


  if (
    state.recorder.state !==
    "inactive"
  ) {

    state.recorder.stop();

  }


  state.recorderState =
    "inactive";


  els.startBtn.disabled =
    false;

  els.pauseBtn.disabled =
    true;

  els.stopBtn.disabled =
    true;

  els.pauseBtn.textContent =
    "Pause";


  setStatus(
    "Processing recording"
  );

}


function finishRecording() {

  pauseTimer();

  stopStream();


  const type =
    state.recorder?.mimeType ||
    "audio/webm";


  state.audioBlob =
    new Blob(
      state.chunks,
      {
        type
      }
    );


  state.chunks =
    [];


  revokeAudioUrl();


  if (
    state.audioBlob.size >
    0
  ) {

    state.audioUrl =
      URL.createObjectURL(
        state.audioBlob
      );


    els.audioPreview.src =
      state.audioUrl;

    els.audioPreview.hidden =
      false;


    const size =
      (
        state.audioBlob.size /
        1024 /
        1024
      ).toFixed(
        2
      );


    info(
      `Recording completed • ${els.timer.textContent} • ${size} MB`
    );


    setStatus(
      "Recorded",
      "saved"
    );


    els.transcribeBtn.disabled =
      !state.modelReady;

  }

  else {

    info(
      "No audio data was recorded."
    );

    setStatus(
      "Ready"
    );

  }


  state.recorder =
    null;

}


/* =========================================================
   UPLOAD
========================================================= */

els.audioFile.addEventListener(
  "change",
  () => {

    const file =
      els.audioFile.files?.[0];


    if (
      !file
    ) {

      return;

    }


    state.audioBlob =
      file;


    revokeAudioUrl();


    state.audioUrl =
      URL.createObjectURL(
        file
      );


    els.audioPreview.src =
      state.audioUrl;

    els.audioPreview.hidden =
      false;


    const size =
      (
        file.size /
        1024 /
        1024
      ).toFixed(
        2
      );


    els.fileInfo.hidden =
      false;

    els.fileInfo.textContent =
      `${file.name} • ${size} MB`;


    setStatus(
      "Audio selected",
      "saved"
    );


    els.transcribeBtn.disabled =
      !state.modelReady;

  }
);


/* =========================================================
   AUDIO DECODING
========================================================= */

async function decodeAudioFile(
  blob
) {

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;


  if (
    !AudioContextClass
  ) {

    throw new Error(
      "Web Audio API is not supported."
    );

  }


  const context =
    new AudioContextClass();


  try {

    return await context.decodeAudioData(
      await blob.arrayBuffer()
    );

  }

  finally {

    await context.close();

  }

}


function audioBufferToMonoFloat32(
  audioBuffer
) {

  if (
    audioBuffer.numberOfChannels ===
    1
  ) {

    return audioBuffer
      .getChannelData(
        0
      )
      .slice();

  }


  const mono =
    new Float32Array(
      audioBuffer.length
    );


  const divisor =
    audioBuffer.numberOfChannels;


  for (
    let channel = 0;
    channel < divisor;
    channel++
  ) {

    const data =
      audioBuffer.getChannelData(
        channel
      );


    for (
      let i = 0;
      i < audioBuffer.length;
      i++
    ) {

      mono[i] +=
        data[i] /
        divisor;

    }

  }


  return mono;

}


function resampleTo16k(
  input,
  inputSampleRate
) {

  const targetRate =
    16000;


  if (
    inputSampleRate ===
    targetRate
  ) {

    return input;

  }


  const ratio =
    targetRate /
    inputSampleRate;


  const outputLength =
    Math.max(
      1,
      Math.floor(
        input.length *
        ratio
      )
    );


  const output =
    new Float32Array(
      outputLength
    );


  for (
    let i = 0;
    i < outputLength;
    i++
  ) {

    const position =
      i / ratio;


    const left =
      Math.floor(
        position
      );


    const right =
      Math.min(
        left + 1,
        input.length - 1
      );


    const fraction =
      position - left;


    output[i] =
      input[left] *
        (1 - fraction) +
      input[right] *
        fraction;

  }


  return output;

}


/* =========================================================
   PROGRESS
========================================================= */

function updateProgress(
  percent,
  text
) {

  els.progressBox.hidden =
    false;


  els.progressBar.style.width =
    `${Math.max(
      0,
      Math.min(
        100,
        percent
      )
    )}%`;


  els.progressText.textContent =
    text;

}


/* =========================================================
   WHISPER BASE
   WASM ONLY
========================================================= */

async function loadModel() {

  if (
    state.modelReady ||
    state.modelLoading
  ) {

    return;

  }


  state.modelLoading =
    true;


  els.loadModelBtn.disabled =
    true;


  setStatus(
    "Loading AI model"
  );


  els.modelStatus.textContent =
    "Loading Whisper Base multilingual on CPU/WASM.";


  updateProgress(
    2,
    "Starting Whisper Base..."
  );


  try {

    state.transcriber =
      await pipeline(
        "automatic-speech-recognition",
        MODEL_ID,
        {

          /*
           * WASM is deliberately used.
           * WebGPU previously caused an error.
           */

          device:
            "wasm",

          /*
           * FP32 is deliberately used.
           * This avoids the q8 MatMulNBits decoder
           * compatibility problem encountered earlier.
           */

          dtype:
            "fp32",

          progress_callback:
            (data) => {

              if (
                typeof data?.progress ===
                "number"
              ) {

                updateProgress(
                  data.progress,
                  `Downloading AI model: ${Math.round(
                    data.progress
                  )}%`
                );

              }

            }

        }

      );


    state.modelReady =
      true;


    state.modelLoading =
      false;


    els.loadModelBtn.disabled =
      true;


    els.loadModelBtn.textContent =
      "Model Ready";


    els.modelStatus.textContent =
      "Whisper Base ready • WASM";


    els.transcribeBtn.disabled =
      !state.audioBlob;


    setStatus(
      "AI Ready",
      "saved"
    );


    updateProgress(
      100,
      "AI model ready."
    );

  }

  catch (error) {

    console.error(
      "Whisper Base model error:",
      error
    );


    state.modelLoading =
      false;


    state.modelReady =
      false;


    els.loadModelBtn.disabled =
      false;


    els.modelStatus.textContent =
      "Unable to load Whisper Base.";


    setStatus(
      "AI model error"
    );


    updateProgress(
      0,
      `Model error: ${
        error?.message ||
        "Unknown error"
      }`
    );


    alert(
      `Whisper Base could not be loaded.\n\n${
        error?.message ||
        "Unknown model error"
      }`
    );

  }

}


/* =========================================================
   LANGUAGE
========================================================= */

function whisperLanguage(
  value
) {

  if (
    value ===
    "id"
  ) {

    return "indonesian";

  }


  if (
    value ===
    "en"
  ) {

    return "english";

  }


  if (
    value ===
    "zh"
  ) {

    return "chinese";

  }


  /*
   * Auto / Mixed:
   * Do NOT force a language.
   * Whisper will handle multilingual input.
   */

  return undefined;

}


/* =========================================================
   SIMPLE LANGUAGE DISPLAY
========================================================= */

function detectLanguageFromText(
  text
) {

  const chinese =
    (
      text.match(
        /[\u3400-\u9fff]/g
      ) || []
    ).length;


  const words =
    (
      text.match(
        /[A-Za-zÀ-ÿ]+/g
      ) || []
    )
      .map(
        (x) =>
          x.toLowerCase()
      );


  const englishWords =
    new Set([

      "the",
      "and",
      "is",
      "are",
      "was",
      "were",
      "will",
      "would",
      "should",
      "meeting",
      "project",
      "planning",
      "next",
      "month",
      "please",
      "thank",
      "everyone"

    ]);


  const indonesianWords =
    new Set([

      "yang",
      "dan",
      "untuk",
      "dengan",
      "akan",
      "sudah",
      "adalah",
      "kita",
      "saya",
      "mereka",
      "bulan",
      "proyek",
      "meeting",
      "tolong",
      "terima"

    ]);


  let englishScore =
    0;


  let indonesianScore =
    0;


  words.forEach(
    (word) => {

      if (
        englishWords.has(
          word
        )
      ) {

        englishScore++;

      }


      if (
        indonesianWords.has(
          word
        )
      ) {

        indonesianScore++;

      }

    }
  );


  if (
    chinese >= 3 &&
    englishScore > 0 &&
    indonesianScore > 0
  ) {

    return "Mixed • Indonesian + English + Mandarin";

  }


  if (
    chinese >= 3 &&
    englishScore > 0
  ) {

    return "Mixed • English + Mandarin";

  }


  if (
    chinese >= 3 &&
    indonesianScore > 0
  ) {

    return "Mixed • Indonesian + Mandarin";

  }


  if (
    chinese >= 3
  ) {

    return "Mandarin likely";

  }


  if (
    englishScore >
    indonesianScore &&
    englishScore > 0
  ) {

    return "English likely";

  }


  if (
    indonesianScore >
    englishScore &&
    indonesianScore > 0
  ) {

    return "Indonesian likely";

  }


  return "Auto • multilingual";

}


/* =========================================================
   TRANSCRIPTION
========================================================= */

async function transcribeAudio() {

  if (
    !state.modelReady ||
    !state.transcriber
  ) {

    alert(
      "The AI model is not ready yet."
    );

    return;

  }


  if (
    !state.audioBlob
  ) {

    alert(
      "Record or upload an audio file first."
    );

    return;

  }


  els.transcribeBtn.disabled =
    true;


  setStatus(
    "Transcribing"
  );


  updateProgress(
    0,
    "Preparing audio..."
  );


  try {

    const audioBuffer =
      await decodeAudioFile(
        state.audioBlob
      );


    updateProgress(
      10,
      "Converting audio to mono 16 kHz..."
    );


    const mono =
      audioBufferToMonoFloat32(
        audioBuffer
      );


    const audio =
      resampleTo16k(
        mono,
        audioBuffer.sampleRate
      );


    updateProgress(
      20,
      "Whisper Base is transcribing locally..."
    );


    const language =
      whisperLanguage(
        els.languageSelect.value
      );


    const options = {

      task:
        "transcribe",

      chunk_length_s:
        30,

      stride_length_s:
        5,

      return_timestamps:
        true

    };


    if (
      language
    ) {

      options.language =
        language;

    }


    const result =
      await state.transcriber(
        audio,
        options
      );


    updateProgress(
      90,
      "Formatting transcript..."
    );


    const text =
      typeof result?.text ===
      "string"
        ? result.text.trim()
        : "";


    if (
      !text
    ) {

      throw new Error(
        "Whisper returned an empty transcript."
      );

    }


    els.transcript.value =
      text;


    els.detectedLanguage.textContent =
      `Language: ${
        detectLanguageFromText(
          text
        )
      }`;


    updateProgress(
      100,
      "Transcription complete."
    );


    setStatus(
      "Transcript ready",
      "saved"
    );

  }

  catch (error) {

    console.error(
      "Transcription error:",
      error
    );


    setStatus(
      "Transcription error"
    );


    updateProgress(
      0,
      `Transcription error: ${
        error?.message ||
        "Unknown error"
      }`
    );


    alert(
      `Transcription failed.\n\n${
        error?.message ||
        "Unknown error"
      }`
    );

  }

  finally {

    els.transcribeBtn.disabled =
      !state.audioBlob ||
      !state.modelReady;

  }

}


/* =========================================================
   SUMMARY
========================================================= */

function splitSentences(
  text
) {

  return text
    .replace(
      /\s+/g,
      " "
    )
    .split(
      /(?<=[.!?。！？])\s+/
    )
    .map(
      (x) =>
        x.trim()
    )
    .filter(
      Boolean
    );

}


function unique(
  items
) {

  return [
    ...new Set(
      items
    )
  ];

}


function extractKeywords(
  sentences,
  patterns
) {

  return sentences.filter(
    (sentence) =>
      patterns.some(
        (pattern) =>
          pattern.test(
            sentence
          )
      )
  );

}


function renderList(
  element,
  items,
  empty
) {

  element.innerHTML =
    "";


  if (
    !items.length
  ) {

    const li =
      document.createElement(
        "li"
      );


    li.textContent =
      empty;


    element.appendChild(
      li
    );


    return;

  }


  items.forEach(
    (item) => {

      const li =
        document.createElement(
          "li"
        );


      li.textContent =
        item;


      element.appendChild(
        li
      );

    }
  );

}


function generateSummary() {

  const text =
    els.transcript.value.trim();


  if (
    !text
  ) {

    alert(
      "Transcribe the meeting first."
    );

    return;

  }


  const sentences =
    splitSentences(
      text
    );


  const decisions =
    unique(
      extractKeywords(
        sentences,
        [

          /\bdecid(ed|e|es|ing)?\b/i,

          /\bdecision\b/i,

          /\bagree(d|ment)?\b/i,

          /\bapproved?\b/i,

          /\bconfirmed?\b/i,

          /\bkeputusan\b/i,

          /\bsepakat\b/i,

          /\bdisetujui\b/i,

          /\bditetapkan\b/i,

          /决定/,

          /同意/,

          /确认/

        ]
      )
    ).slice(
      0,
      10
    );


  const actions =
    unique(
      extractKeywords(
        sentences,
        [

          /\baction\b/i,

          /\baction item\b/i,

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

        ]
      )
    ).slice(
      0,
      10
    );


  els.summaryOverview.textContent =
    sentences
      .slice(
        0,
        5
      )
      .join(
        " "
      );


  renderList(
    els.decisionsList,
    decisions,
    "No decision keywords detected."
  );


  renderList(
    els.actionsList,
    actions,
    "No action-item keywords detected."
  );


  setStatus(
    "Summary generated",
    "saved"
  );

}


/* =========================================================
   SAVE
========================================================= */

function saveDraft() {

  const data = {

    transcript:
      els.transcript.value,

    summary:
      els.summaryOverview.textContent,

    decisions:
      [
        ...els.decisionsList
          .querySelectorAll(
            "li"
          )
      ].map(
        (li) =>
          li.textContent
      ),

    actions:
      [
        ...els.actionsList
          .querySelectorAll(
            "li"
          )
      ].map(
        (li) =>
          li.textContent
      ),

    savedAt:
      new Date().toISOString()

  };


  localStorage.setItem(
    "MeetingSummaryDraft",
    JSON.stringify(
      data
    )
  );


  setStatus(
    "Draft saved",
    "saved"
  );

}


/* =========================================================
   EXPORT
========================================================= */

function exportTxt() {

  const content = [

    "MEETINGSUMMARY",

    "",

    "EXECUTIVE SUMMARY",

    els.summaryOverview.textContent,

    "",

    "KEY DECISIONS",

    ...[
      ...els.decisionsList
        .querySelectorAll(
          "li"
        )
    ].map(
      (li) =>
        `- ${li.textContent}`
    ),

    "",

    "ACTION ITEMS",

    ...[
      ...els.actionsList
        .querySelectorAll(
          "li"
        )
    ].map(
      (li) =>
        `- ${li.textContent}`
    ),

    "",

    "TRANSCRIPT",

    els.transcript.value

  ].join(
    "\n"
  );


  const blob =
    new Blob(
      [content],
      {
        type:
          "text/plain;charset=utf-8"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    `MeetingSummary-${
      new Date()
        .toISOString()
        .slice(
          0,
          10
        )
    }.txt`;


  document.body.appendChild(
    a
  );


  a.click();


  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );

}


/* =========================================================
   CLEAR
========================================================= */

function clearTranscript() {

  els.transcript.value =
    "";

  els.detectedLanguage.textContent =
    "Language: —";

}


function clearAll() {

  if (
    !confirm(
      "Clear the current meeting data?"
    )
  ) {

    return;

  }


  clearTranscript();


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


  els.audioFile.value =
    "";


  state.audioBlob =
    null;


  revokeAudioUrl();


  els.audioPreview.removeAttribute(
    "src"
  );


  els.audioPreview.hidden =
    true;


  els.fileInfo.hidden =
    true;


  els.recordingInfo.hidden =
    true;


  resetTimer();


  els.transcribeBtn.disabled =
    true;


  setStatus(
    "Ready"
  );

}


/* =========================================================
   EVENTS
========================================================= */

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


els.loadModelBtn.addEventListener(
  "click",
  loadModel
);


els.transcribeBtn.addEventListener(
  "click",
  transcribeAudio
);


els.generateBtn.addEventListener(
  "click",
  generateSummary
);


els.clearTranscriptBtn.addEventListener(
  "click",
  clearTranscript
);


els.saveBtn.addEventListener(
  "click",
  saveDraft
);


els.exportBtn.addEventListener(
  "click",
  exportTxt
);


els.clearAllBtn.addEventListener(
  "click",
  clearAll
);


/* =========================================================
   INITIAL STATE
========================================================= */

els.pauseBtn.disabled =
  true;


els.stopBtn.disabled =
  true;


els.transcribeBtn.disabled =
  true;


els.timer.textContent =
  "00:00:00";


setStatus(
  "Ready"
);


/* =========================================================
   AUTOMATIC MODEL LOADING
========================================================= */

window.addEventListener(
  "load",
  () => {

    setTimeout(
      () => {

        loadModel();

      },
      250
    );

  }
);
