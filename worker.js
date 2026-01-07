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

    // 1. COMPROBACIÓN RAG (Preguntas al PDF)
    if (ragContext && text.includes("?")) {
        console.log("🔎 Buscando respuesta en el PDF...");

        // Búsqueda inteligente: buscamos palabras de la pregunta en el texto
        const questionWords = text.toLowerCase().split(' ').filter(w => w.length > 3);
        let relevantChunk = ragContext.slice(0, 1500); // Por defecto el inicio

        for (let word of questionWords) {
            const index = ragContext.toLowerCase().indexOf(word);
            if (index !== -1) {
                // Si encontramos la palabra, cogemos el texto de alrededor
                const start = Math.max(0, index - 500);
                const end = Math.min(ragContext.length, index + 1000);
                relevantChunk = ragContext.slice(start, end);
                console.log(`📍 Coincidencia encontrada con "${word}"`);
                break;
            }
        }

        // Prompt específico para responder preguntas
        const promptRAG = `Context: "${relevantChunk}"\n\nQuestion: "${text}"\nAnswer (be concise):`;
        
        const response = await generator(promptRAG, { max_new_tokens: 100 });
        
        self.postMessage({ 
            type: 'hat-response', 
            hat: 'Memoria (RAG)', 
            color: 'hat-white', 
            text: response[0].generated_text 
        });
        return; // Importante: Salimos aquí para no ejecutar los otros sombreros
    }

    // 2. SI NO ES RAG, EJECUTAMOS LOS 6 SOMBREROS NORMALES
    const labels = ["crítica", "idea", "dato", "emoción"];
    const classification = await classifier(text, labels);
    const topLabel = classification.labels[0];
    
    let prompt = "";
    let hatColor = "";

    if (topLabel === "crítica") {
        prompt = `Criticize this idea: "${text}"`;
        hatColor = "hat-black";
    } else if (topLabel === "idea") {
        prompt = `Brainstorm a related idea to: "${text}"`;
        hatColor = "hat-green";
    } else {
        prompt = `Summarize: "${text}"`;
        hatColor = "hat-blue";
    }
    
    const response = await generator(prompt, { max_new_tokens: 40 });
    
    self.postMessage({ 
        type: 'hat-response', 
        hat: topLabel, 
        color: hatColor,
        text: response[0].generated_text 
    });
}