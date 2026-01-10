# 🔒 Brainstorming AI: Secure Workspace (Local-First)

**Sistema inteligente de colaboración multimodal que se ejecuta 100% en el navegador. Cero datos enviados a la nube.**

## 📖 Descripción del Proyecto
Este sistema está diseñado para entornos donde la privacidad es crítica (como laboratorios de I+D). A diferencia de las herramientas convencionales, este asistente de reuniones procesa audio, texto e imágenes directamente en el dispositivo del usuario, garantizando que ninguna información confidencial salga del ordenador local.

Utiliza **WebGPU** y la librería `transformers.js` para ejecutar modelos de Inteligencia Artificial directamente en el cliente.

## ✨ Características Principales

### 1. 🎙️ Transcripción Privada (Whisper Local)
Reconocimiento de habla en tiempo real que funciona sin conexión.
- **Modelo:** `Xenova/whisper-small`.
- **Privacidad:** El audio se procesa en el navegador, no se envía a servidores externos.

### 2. 🧠 Razonamiento Agéntico ("Seis Sombreros")
El sistema actúa como un facilitador experto estructurando la conversación mediante la metodología de Edward de Bono.
- **Clasificación Zero-Shot:** Detecta la intención del usuario automáticamente.
- **Roles Dinámicos:** Genera respuestas especializadas (Crítica, Creatividad, Hechos, Emociones) según el contexto de la reunión.

### 3. 👁️ Pizarra Multimodal
Lienzo digital (Canvas) integrado con modelos de Visión-Lenguaje (MLLM).
- Permite dibujar esquemas o diagramas en pantalla.
- La IA (modelo ligero tipo Janus) analiza el dibujo visualmente y ofrece feedback técnico o sugerencias de mejora.

### 4. 📂 RAG Local (Retrieval-Augmented Generation)
Sistema de consulta documental inteligente.
- **Drag & Drop:** Arrastra documentos PDF técnicos a la interfaz.
- **Búsqueda Semántica:** Generación de embeddings locales para responder preguntas sobre el contenido del documento sin salir del navegador.

## 🛠️ Stack Tecnológico
Arquitectura "Client-side" pura para máxima seguridad:

- **Core:** HTML5, CSS3, JavaScript.
- **IA en Navegador:** `transformers.js`.
- **Procesamiento en Segundo Plano:** Web Workers (`worker.js`) para mantener la interfaz fluida durante la inferencia.
- **Aceleración:** WebGPU (recomendado para los modelos multimodales).

## 🚀 Instalación y Uso

1.  **Clonar el repositorio:**
    ```bash
    git clone [[https://github.com/TU_USUARIO/Brainstorming-AI-Local.git](https://github.com/TU_USUARIO/Brainstorming-AI-Local.git](https://github.com/sara0328/Brainstorming-AI-Local.git))
    ```

2.  **Ejecución:**
    Al ser una aplicación estática, no requiere backend. Puedes abrir el archivo `index.html` directamente en un navegador moderno (Chrome o Edge recomendados para soporte WebGPU).

---
