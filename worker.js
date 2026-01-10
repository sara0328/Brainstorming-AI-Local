// worker.js COMPLETO

// Importamos la librería
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Configuración básica
env.allowLocalModels = false; 

// Variables globales
let transcriber = null;
let classifier = null;
let generator = null;
let visionModel = null;
let ragContext = ""; // Aquí se guardará el texto del PDF

// ESCUCHAMOS MENSAJES DE LA INTERFAZ
self.addEventListener('message', async (event) => {
    // IMPORTANTE: Añadimos 'context' a la desestructuración para poder leerlo
    const { type, data, image, context } = event.data;

    try {
        switch (type) {
            case 'load':
                self.postMessage({ status: 'loading', message: 'Cargando Whisper...' });
                transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
                
                self.postMessage({ status: 'loading', message: 'Cargando Clasificador...' });
                classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');

                self.postMessage({ status: 'loading', message: 'Cargando Generador...' });
                generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-248M');

                self.postMessage({ status: 'loading', message: 'Cargando Visión...' });
                visionModel = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');

                self.postMessage({ status: 'ready', message: '¡Sistema Completo Listo!' });
                break;

            case 'transcribe':
                if (!transcriber) return;
                const output = await transcriber(data);
                self.postMessage({ type: 'transcript', text: output.text });
                // Pasamos el texto a la lógica de los sombreros
                analyzeThinkingHats(output.text);
                break;

            case 'analyze-image':
                if (!visionModel || !generator) return;
                const visionOutput = await visionModel(image);
                const description = visionOutput[0].generated_text;
                const promptImg = `Give a short suggestion to improve a sketch of: ${description}`;
                const advice = await generator(promptImg, { max_new_tokens: 40 });

                self.postMessage({ 
                    type: 'hat-response', 
                    hat: 'multimodal', 
                    color: 'hat-purple',
                    text: `(Veo: ${description}) -> ${advice[0].generated_text}` 
                });
                break;

            // --- ESTE ES EL BLOQUE QUE TE FALTABA ---
            case 'update-context':
                // Guardamos el texto que viene desde main.js en la variable global
                ragContext = context;
                console.log("📄 Worker: Contexto PDF actualizado. Longitud:", ragContext.length);
                break;
            // ----------------------------------------
        }
    } catch (error) {
        console.error(error);
        self.postMessage({ status: 'error', message: error.message });
    }
});

// FUNCIÓN LÓGICA DE LOS SOMBREROS (CON MEJORA DE BÚSQUEDA)
async function analyzeThinkingHats(text) {
    if (!classifier || !generator) return;

    // --- 1. AGENTE DE MEMORIA (RAG - Sombrero Blanco Potenciado) ---
    // Si hay PDF y pregunta, usamos el RAG como "Super Sombrero Blanco"
    if (ragContext && text.includes("?")) {
        console.log("🔎 Buscando en PDF...");
        const questionWords = text.toLowerCase().split(' ').filter(w => w.length > 3);
        let relevantChunk = ragContext.slice(0, 1500);

        for (let word of questionWords) {
            const index = ragContext.toLowerCase().indexOf(word);
            if (index !== -1) {
                const start = Math.max(0, index - 500);
                const end = Math.min(ragContext.length, index + 1000);
                relevantChunk = ragContext.slice(start, end);
                break;
            }
        }

        const promptRAG = `
        Instrucción: Actúa como un analista de datos (Sombrero Blanco). Responde a la pregunta usando SOLO el contexto.
        Contexto: "${relevantChunk}"
        Pregunta: "${text}"
        Respuesta (en español):`;
        
        const response = await generator(promptRAG, { max_new_tokens: 100 });
        
        self.postMessage({ 
            type: 'hat-response', 
            hat: 'Sombrero Blanco (Datos PDF)', 
            color: 'hat-white', 
            text: response[0].generated_text 
        });
        return; 
    }

    // --- 2. ORQUESTADOR (Clasificación Zero-Shot) ---
    // Definimos las etiquetas que corresponden a los 6 sombreros 
    const labels = [
        "crítica y riesgos",       // Negro
        "ideas y creatividad",     // Verde
        "emociones y sentimientos",// Rojo
        "beneficios y optimismo",  // Amarillo
        "control y resumen",       // Azul
        "hechos y datos"           // Blanco (General)
    ];

    // El modelo decide cuál encaja mejor
    const classification = await classifier(text, labels);
    const topLabel = classification.labels[0];
    
    // --- 3. EJECUCIÓN DE AGENTES (Prompts Dinámicos)  ---
    let prompt = "";
    let hatColor = "";
    let hatName = "";

    switch (topLabel) {
        case "crítica y riesgos": // SOMBRERO NEGRO
            prompt = `Analiza los riesgos o problemas de esta frase: "${text}". Responde en español brevemente.`;
            hatColor = "hat-black";
            hatName = "Sombrero Negro (Crítico)";
            break;

        case "ideas y creatividad": // SOMBRERO VERDE
            prompt = `Propón una idea alternativa o creativa relacionada con: "${text}". Responde en español.`;
            hatColor = "hat-green";
            hatName = "Sombrero Verde (Creativo)";
            break;

        case "emociones y sentimientos": // SOMBRERO ROJO
            prompt = `Analiza qué emoción transmite esta frase: "${text}". ¿Es frustración, alegría, miedo? Responde en español.`;
            hatColor = "hat-red";
            hatName = "Sombrero Rojo (Emoción)";
            break;

        case "beneficios y optimismo": // SOMBRERO AMARILLO
            prompt = `Menciona un beneficio positivo de esto: "${text}". Responde en español.`;
            hatColor = "hat-yellow";
            hatName = "Sombrero Amarillo (Optimista)";
            break;

        case "control y resumen": // SOMBRERO AZUL
            prompt = `Haz un resumen ejecutivo muy breve de: "${text}". Responde en español.`;
            hatColor = "hat-blue";
            hatName = "Sombrero Azul (Control)";
            break;

        default: // SOMBRERO BLANCO (Si no es PDF)
            prompt = `Extrae los hechos objetivos de: "${text}". Responde en español.`;
            hatColor = "hat-white";
            hatName = "Sombrero Blanco (Hechos)";
            break;
    }
    
    // Generamos la respuesta con el "Agente" seleccionado
    const response = await generator(prompt, { max_new_tokens: 60 });
    
    self.postMessage({ 
        type: 'hat-response', 
        hat: hatName, 
        color: hatColor,
        text: response[0].generated_text 
    });
}