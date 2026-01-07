// main.js

// Inicializamos el Worker
const worker = new Worker('worker.js', { type: 'module' });

// Referencias al DOM
const statusDiv = document.getElementById('status');
const recordBtn = document.getElementById('recordBtn');
const liveText = document.getElementById('live-text');
const aiMessages = document.getElementById('ai-messages');

// ESCUCHAR MENSAJES DEL WORKER
worker.onmessage = (e) => {
    const { status, message, type, text, color, hat } = e.data;

    if (status) {
        statusDiv.innerText = message;
        if (status === 'ready') recordBtn.disabled = false;
    }

    if (type === 'transcript') {
        liveText.innerText = text;
    }

    if (type === 'hat-response') {
        const card = document.createElement('div');
        card.className = `hat-card ${color}`;
        card.innerHTML = `<strong>${hat.toUpperCase()}:</strong> ${text}`;
        aiMessages.prepend(card);
    }
};

// Iniciar carga de modelos
worker.postMessage({ type: 'load' });

// --- LÓGICA DE AUDIO CORREGIDA ---
let mediaRecorder;
let audioChunks = [];

recordBtn.addEventListener('click', async () => {
    if (recordBtn.innerText.includes('Iniciar')) {
        // 1. Pedir permiso de micrófono
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        audioChunks = []; // Limpiar buffer anterior

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            // Creamos un Blob con el audio grabado
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // LLAMAMOS A LA NUEVA FUNCIÓN DE PROCESAMIENTO
            processAudioAndSendToWorker(audioBlob);
        };

        mediaRecorder.start();
        recordBtn.innerText = '⏹️ Detener y Analizar';
        liveText.innerText = "Escuchando...";
    } else {
        mediaRecorder.stop();
        recordBtn.innerText = '🎤 Iniciar Grabación';
        statusDiv.innerText = "Procesando audio...";
    }
});

// --- NUEVA FUNCIÓN PARA ARREGLAR EL ERROR DE AUDIOCONTEXT ---
async function processAudioAndSendToWorker(blob) {
    // 1. Convertir el Blob a ArrayBuffer (datos binarios)
    const arrayBuffer = await blob.arrayBuffer();

    // 2. Decodificar el audio AQUÍ (en el hilo principal, donde sí existe AudioContext)
    // Intentamos forzar 16000Hz que es lo que usa Whisper para ser más rápido y preciso
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    
    try {
        const decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);
        
        // 3. Obtener los datos del canal 0 (mono)
        const audioData = decodedAudio.getChannelData(0);

        // 4. Enviar los datos crudos (Float32Array) al worker
        // Esto evita que el worker tenga que decodificar nada
        worker.postMessage({ 
            type: 'transcribe', 
            data: audioData 
        });

    } catch (error) {
        console.error("Error al decodificar audio:", error);
        liveText.innerText = "Error procesando el audio. Intenta hablar más fuerte o usar otro micro.";
    }
}

// --- LÓGICA DE LA PIZARRA (CANVAS) -----------------------------------------------------------------------------------------------------------
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
// Rellenar el fondo de blanco al inicio para evitar transparencias
ctx.fillStyle = "white";
ctx.fillRect(0, 0, canvas.width, canvas.height);
const clearBtn = document.getElementById('clearCanvasBtn');
const analyzeBtn = document.getElementById('analyzeCanvasBtn');

let isDrawing = false;



// Configuración del lápiz
ctx.lineWidth = 3;
ctx.lineCap = 'round';
ctx.strokeStyle = '#000000';


// Eventos del Ratón
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

function startDrawing(e) {
    isDrawing = true;
    draw(e); // Para permitir puntos simples
}

function draw(e) {
    if (!isDrawing) return;
    
    // Obtener posición correcta del ratón relativa al canvas
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath(); // Resetear el path para no unir líneas separadas
}

// Botón Borrar
clearBtn.addEventListener('click', () => {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});

// Botón Analizar (Lo conectaremos en el siguiente paso)
analyzeBtn.addEventListener('click', async () => {
    // 1. Convertir dibujo a imagen (base64)
    const imageData = canvas.toDataURL('image/png');
    
    // 2. Avisar al usuario
    const originalText = analyzeBtn.innerText;
    analyzeBtn.innerText = "👁️ Analizando...";
    analyzeBtn.disabled = true;

    // 3. Enviar al worker
    worker.postMessage({ 
        type: 'analyze-image', 
        image: imageData 
    });

    // Restaurar botón después de unos segundos (simulado hasta que el worker responda)
    setTimeout(() => {
        analyzeBtn.innerText = originalText;
        analyzeBtn.disabled = false;
    }, 3000);
});

// --- LÓGICA RAG (Documentos) ---
const dropZone = document.getElementById('drop-zone');
let pdfContent = ""; // Aquí guardaremos el texto del PDF

// Eventos de Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.background = '#e9ecef';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.background = 'white';
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.style.background = 'white';
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        dropZone.innerText = `📄 Procesando ${file.name}...`;
        
        try {
            // Leemos el archivo
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            let fullText = "";
            
            // Extraemos texto página a página
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + " ";
            }
            
            // Guardamos el texto y avisamos al worker
            pdfContent = fullText;
            dropZone.innerText = `✅ PDF Cargado: ${file.name}`;
            
            // Enviamos el contexto al worker
            worker.postMessage({
                type: 'update-context',
                context: pdfContent
            });
            
        } catch (error) {
            console.error(error);
            dropZone.innerText = "❌ Error al leer PDF";
        }
    }
});