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

// Traduccion
let translatorESEN = null;
let translatorENES = null;


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

                // Traductores
                translatorESEN = await pipeline(
                    'translation',
                    'Xenova/opus-mt-es-en'
                );

                translatorENES = await pipeline(
                    'translation',
                    'Xenova/opus-mt-en-es'
                );


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

// Traduccion
async function translateToEnglish(text) {
    if (!translatorESEN) return text;
    const result = await translatorESEN(text);
    return result[0].translation_text;
}

async function translateToSpanish(text) {
    if (!translatorENES) return text;
    const result = await translatorENES(text);
    return result[0].translation_text;
}


// FUNCIÓN LÓGICA DE LOS SOMBREROS (CON MEJORA DE BÚSQUEDA)
async function analyzeThinkingHats(text) {
    if (!classifier || !generator) return;

    // 1. Traducir entrada a inglés
    const textEN = await translateToEnglish(text);

    // --- 1. AGENTE DE MEMORIA (RAG - Sombrero Blanco Potenciado) ---
    // Si hay PDF y pregunta, usamos el RAG como "Super Sombrero Blanco"
    if (ragContext && text.includes("?")) {
        console.log("🔎 Buscando en PDF...");

        const questionWords = text.toLowerCase().split(' ').filter(w => w.length > 3);

        // extraer el fragmento relevante
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

        // traducir contexto al ingles
        const relevantChunkEN = await translateToEnglish(relevantChunk);


        const promptRAG = `
        You are a data analyst using the White Hat from the Six Thinking Hats method.
        Use ONLY the information provided in the context to answer the question.
        Do NOT invent anything.

        Context: "${relevantChunkEN}"

        Question: "${textEN}"

        Answer:`;

        const response = await generator(promptRAG, { max_new_tokens: 100 });

        const answerEN = response[0].generated_text;

        // Traducir la respuesta al español
        const answerES = await translateToSpanish(answerEN);

        self.postMessage({
            type: 'hat-response',
            hat: 'Sombrero Blanco (Datos PDF)',
            color: 'hat-white',
            text: answerES
        });
        return;
    }

    // --- 2. ORQUESTADOR (Clasificación Zero-Shot) ---
    // Definimos las etiquetas que corresponden a los 6 sombreros 
    const labels = [
        "facts and data",           // Blanco (General)
        "risks and problems",       // Negro
        "creative ideas",     // Verde
        "emotions and feelings",// Rojo
        "benefits and optimism",  // Amarillo
        "process control and summary",       // Azul
    ];

    // El modelo decide cuál encaja mejor
    //const classification = await classifier(textEN, labels);
    let topLabel;

    // --- 3. EJECUCIÓN DE AGENTES (Prompts Dinámicos)  ---
    let prompt = "";
    let hatColor = "";
    let hatName = "";


    // Heurística: si es un texto corto o neutro, usamos Sombrero Blanco
    if (!ragContext && text.length < 50 && !text.includes("?")) {
        // Verificamos si el texto parece un hecho objetivo: números, fechas, nombres
        const factPattern = /\b\d+(\.\d+)?%?\b|\b\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

        if (factPattern.test(text)) {
            topLabel = "facts and data"; // Sombrero Blanco
        } else {
            // Dejamos que el clasificador decida
            const classification = await classifier(textEN, labels);
            topLabel = classification.labels[0];
        }
    } else {
        // El modelo decide cuál encaja mejor
        const classification = await classifier(textEN, labels);
        topLabel = classification.labels[0];
    }

    switch (topLabel) {
        case "risks and problems": // SOMBRERO NEGRO
            prompt = ` 
            You are an analyst using the Black Hat from the Six Thinking Hats method. 
            Your task is to identify ONLY risks, weaknesses, or potential problems in the situation.
            Do NOT suggest solutions.
            Do NOT repeat or paraphrase the original text.
            Focus only on possible negative outcomes.

            Text: "${textEN}". 

            Answer with a risk in 1-2 sentences describing the risk:
            `;
            hatColor = "hat-black";
            hatName = "Sombrero Negro (Crítico)";
            break;

        case "creative ideas": // SOMBRERO VERDE
            prompt = ` You are a creative facilitator using the Green Hat from the Six Thinking Hats method. 
            Context: business and project evaluation.

            Task:
            Suggest ONE alternative idea that addresses the concern in the text.
            The idea must stay on the SAME topic.
            Do NOT change the subject.
            Do NOT talk about unrelated areas.

            Text: 
            "${textEN}"
            
            Propose an alternative or creative idea related to the text:
            `;
            hatColor = "hat-green";
            hatName = "Sombrero Verde (Creativo)";
            break;

        case "emotions and feelings": // SOMBRERO ROJO
            prompt = `
            You are an emotional observer using the Red Hat from the Six Thinking Hats method. 
            Identify the dominant emotion without justification.

            Text: 
            "${textEN}"
    
            Answer with an emotion:`;
            hatColor = "hat-red";
            hatName = "Sombrero Rojo (Emoción)";
            break;

        case "benefits and optimism": // SOMBRERO AMARILLO
            prompt = `
            You are an optimistic analyst using the Yellow Hat from the Six Thinking Hats method. 
            Mention ONLY positive aspects or benefits.
            Do not mention risks.
            
            Text: 
            "${textEN}"
            
            Answer with a positive aspect:
            `;
            hatColor = "hat-yellow";
            hatName = "Sombrero Amarillo (Optimista)";
            break;

        case "process control and summary": // SOMBRERO AZUL
            prompt = ` You are the process controller using the Blue Hat from the Six Thinking Hats method. .
            Summarize and organize this text: "${textEN}". 
            
            Answer with executive summary:`;
            hatColor = "hat-blue";
            hatName = "Sombrero Azul (Control)";
            break;

        default: // SOMBRERO BLANCO (Si no es PDF)
            prompt = `
            You are a factual analyst using the White Hat from the Six Thinking Hats method.
            Extract only the objective facts from the following text.
            List the facts as simple sentences.

            Text: "${textEN}"

            Answer:
            `;
            hatColor = "hat-white";
            hatName = "Sombrero Blanco (Hechos)";
            break;
    }

    // Generamos la respuesta con el "Agente" seleccionado
    const response = await generator(prompt, { max_new_tokens: 60 });
    let answerEN = response[0].generated_text;

    // Siempre traducir al español
    const answerES = await translateToSpanish(answerEN);

    self.postMessage({
        type: 'hat-response',
        hat: hatName,
        color: hatColor,
        text: answerES
    });
}