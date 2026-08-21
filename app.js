import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Elemen DOM
const statusEl = document.getElementById('model-status');
const btnRecord = document.getElementById('btn-record');
const btnStop = document.getElementById('btn-stop');
const btnTranscribe = document.getElementById('btn-transcribe');
const timerEl = document.getElementById('timer');
const infoEl = document.getElementById('record-info');
const audioPreview = document.getElementById('audio-preview');
const resultBox = document.getElementById('result-box');
const transcriptText = document.getElementById('transcript-text');
const btnCopy = document.getElementById('btn-copy');

let transcriber = null;
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let timerInterval = null;
let seconds = 0;

// ✅ Inisialisasi model saat halaman dimuat
async function initModel() {
    try {
        // Gunakan whisper-tiny agar muat di RAM mobile
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
        
        statusEl.className = 'status-box ready';
        statusEl.textContent = '✅ Mesin AI siap! Silakan rekam.';
        btnRecord.disabled = false;
    } catch (err) {
        console.error('Model load failed:', err);
        statusEl.className = 'status-box error';
        statusEl.innerHTML = `❌ Gagal memuat AI. <small>${err.message} Coba refresh halaman atau gunakan Chrome.</small>`;
    }
}

// Jalankan inisialisasi
initModel();

// Timer helper
function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

function startTimer() {
    seconds = 0;
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
        seconds++;
        timerEl.textContent = formatTime(seconds);
        // Batas aman untuk mobile: 60 detik
        if (seconds >= 60) btnStop.click();
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// ✅ Rekam Audio (menggunakan MediaRecorder native)
btnRecord.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(recordedBlob);
            audioPreview.src = url;
            audioPreview.style.display = 'block';
            btnTranscribe.disabled = false;
            infoEl.textContent = `Terekam: ${formatTime(seconds)} | Siap ditranskrip`;
            
            // Hentikan semua track mic
            stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start();
        startTimer();
        
        btnRecord.disabled = true;
        btnStop.disabled = false;
        btnTranscribe.disabled = true;
        resultBox.style.display = 'none';
        infoEl.textContent = '🔴 Sedang merekam...';
    } catch (err) {
        alert('Gagal mengakses mikrofon. Pastikan izin diberikan.');
        console.error(err);
    }
});

btnStop.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        stopTimer();
        btnRecord.disabled = false;
        btnStop.disabled = true;
    }
});

// ✅ Transkripsi dengan error handling yang benar
btnTranscribe.addEventListener('click', async () => {
    if (!transcriber) {
        alert('Mesin AI belum siap. Mohon tunggu.');
        return;
    }
    if (!recordedBlob) {
        alert('Belum ada audio yang direkam.');
        return;
    }

    btnTranscribe.disabled = true;
    btnTranscribe.textContent = '⏳ Sedang mentranskrip...';
    resultBox.style.display = 'none';

    try {
        // Konversi blob ke Float32Array untuk Whisper
        const arrayBuffer = await recordedBlob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        
        // Ambil channel pertama (mono)
        const audioData = decoded.getChannelData(0);
        
        const output = await transcriber(audioData, { 
            language: 'indonesian', // Default ID, bisa diubah
            task: 'transcribe' 
        });

        const text = output[0]?.text || '(Tidak ada teks terdeteksi)';
        transcriptText.textContent = text;
        resultBox.style.display = 'block';
        infoEl.textContent = '✅ Transkripsi selesai!';
    } catch (err) {
        console.error('Transcribe error:', err);
        transcriptText.textContent = `❌ Error: ${err.message}`;
        resultBox.style.display = 'block';
        infoEl.textContent = 'Gagal mentranskrip. Coba rekam ulang.';
    } finally {
        btnTranscribe.disabled = false;
        btnTranscribe.textContent = '✨ Transkrip ke Teks (ID/EN/ZH)';
    }
});

// Salin teks
btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(transcriptText.textContent)
        .then(() => {
            const original = btnCopy.textContent;
            btnCopy.textContent = '✅ Tersalin!';
            setTimeout(() => btnCopy.textContent = original, 1500);
        });
});