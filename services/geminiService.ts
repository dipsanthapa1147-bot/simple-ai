import { GoogleGenAI, GenerateVideosOperation, Modality, Type } from '@google/genai';
import { ApiKeyError } from './errors';
import { fileToBase64 } from '../utils/helpers';
import { ChatMessage } from '../types';

const getGenAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new ApiKeyError('API key is missing.');
  }
  return new GoogleGenAI({ apiKey });
};

const handleApiError = (error: any) => {
  console.error("Gemini API Error:", error);
  if (error.message.includes('API key') || (error.message.includes('permission denied')) || (error.message.includes("was not found")) || (error.status && (error.status >= 400 && error.status < 500))) {
    throw new ApiKeyError('API key is invalid or has insufficient permissions.');
  }
  throw error;
};

// For PromptLabView
export const generateText = async (
  prompt: string,
  temperature: number,
  topK: number,
  topP: number
): Promise<string> => {
  try {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        temperature,
        topK,
        topP,
      },
    });
    return response.text;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};


// For ChatView (Search Grounded mode)
export const generateGroundedContent = async (
  prompt: string,
  imageFile: File | null,
  history: ChatMessage[]
): Promise<{ text: string; groundingSources: any[] }> => {
  try {
    const ai = getGenAI();
    
    // The history for generateContent is a simple array of Content objects.
    // We filter out any streaming messages that might be in the React state.
    const contents = history.filter(m => !m.isStreaming).map(msg => ({
      role: msg.role,
      parts: msg.parts.map(p => ({ text: p.text }))
    }));
    
    const userParts: any[] = [{ text: prompt }];
    if (imageFile) {
        const base64Image = await fileToBase64(imageFile);
        userParts.push({
            inlineData: {
                data: base64Image,
                mimeType: imageFile.type
            }
        });
    }
    contents.push({ role: 'user', parts: userParts });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingSources = groundingChunks
        .map((chunk: any) => chunk.web)
        .filter(Boolean)
        .map((webChunk: any) => ({ uri: webChunk.uri, title: webChunk.title || webChunk.uri }))
        .filter((source: any, index: number, self: any[]) => index === self.findIndex(s => s.uri === source.uri));
        
    return { text, groundingSources };

  } catch (error) {
    handleApiError(error);
    throw error;
  }
};


// For ImageGenieView
export const generateImage = async (prompt: string, aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'): Promise<string> => {
  try {
    const ai = getGenAI();
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: aspectRatio,
      },
    });
    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${base64ImageBytes}`;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const analyzeImage = async (prompt: string, imageFile: File): Promise<string> => {
  try {
    const ai = getGenAI();
    const base64Image = await fileToBase64(imageFile);
    
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: imageFile.type,
      },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
    });
    
    return response.text;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const analyzeVideo = async (prompt: string, videoFile: File): Promise<string> => {
  try {
    const ai = getGenAI();
    const base64Video = await fileToBase64(videoFile);
    
    const videoPart = {
      inlineData: {
        data: base64Video,
        mimeType: videoFile.type || 'video/mp4',
      },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: { parts: [videoPart, textPart] },
    });
    
    return response.text;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// For VideoFactoryView
export const generateVideo = async (prompt: string, aspectRatio: '16:9' | '9:16', resolution: '720p' | '1080p'): Promise<GenerateVideosOperation> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: resolution,
                aspectRatio: aspectRatio,
            }
        });
        return operation;
    } catch (error) {
        handleApiError(error);
        throw error;
    }
};

export const checkVideoOperation = async (operation: GenerateVideosOperation): Promise<GenerateVideosOperation> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await ai.operations.getVideosOperation({ operation: operation });
    } catch (error) {
        handleApiError(error);
        throw error;
    }
};

// For TranscribeView & ScriptGenieView
export const transcribeAudio = async (audioFile: File): Promise<string> => {
  try {
    const ai = getGenAI();
    const audioBytes = await fileToBase64(audioFile);
    
    const audioPart = {
      inlineData: {
        data: audioBytes,
        mimeType: audioFile.type || 'audio/webm',
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: { parts: [audioPart, { text: 'Transcribe this audio.' }] },
    });

    return response.text;
  } catch (error) {
    handleApiError(error);
    return '';
  }
};

// For ScriptGenieView
export const generateScriptStream = async (prompt: string, scriptType: string, tone: string, length: number, format: string, style: string, chapters: number) => {
    try {
        const ai = getGenAI();
        const systemInstruction = `You are a script writer. Your task is to generate a script based on the user's request.
        - Script Type: ${scriptType}
        - Tone: ${tone}
        - Format: ${format}
        - Style: ${style}
        - The user wants a script that is approximately ${length} words long.
        - The script should have ${chapters} chapter(s)/volume(s).`;
        
        const fullPrompt = `Please generate a script about: "${prompt}".`;

        const response = await ai.models.generateContentStream({
            model: 'gemini-2.5-pro',
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response;
    } catch (error) {
        handleApiError(error);
        throw error;
    }
};

export const continueScriptStream = async (existingScript: string, prompt: string, scriptType: string, tone: string, length: number, format: string, style: string, startChapter: number, endChapter: number) => {
    try {
        const ai = getGenAI();
        const systemInstruction = `You are a script writer continuing an existing script.
        - Script Type: ${scriptType}
        - Tone: ${tone}
        - Format: ${format}
        - Style: ${style}
        - The user wants to add chapters from ${startChapter} to ${endChapter}. Each new chapter should be about ${length} words long.
        - Do not repeat the existing script. Continue where it left off.`;
        
        const fullPrompt = `Here is the existing script:\n\n---\n\n${existingScript}\n\n---\n\nPlease continue the script based on the original prompt: "${prompt}".`;

        const response = await ai.models.generateContentStream({
            model: 'gemini-2.5-pro',
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response;
    } catch (error) {
        handleApiError(error);
        throw error;
    }
};

export const suggestPrompts = async (scriptType: string, tone: string): Promise<string[]> => {
    try {
        const ai = getGenAI();
        const prompt = `Generate 3 diverse and creative prompt ideas for a ${tone} ${scriptType}. Return the ideas as a JSON array of strings. Example: ["Idea 1", "Idea 2", "Idea 3"]`;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING
                    }
                }
            }
        });
        const jsonText = response.text.trim();
        // The result can sometimes be in a markdown block
        const cleanedJson = jsonText.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleanedJson);
    } catch (error) {
        handleApiError(error);
        return [];
    }
};

export const generateTts = async (text: string): Promise<string | null> => {
    try {
        const ai = getGenAI();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        return base64Audio || null;
    } catch (error) {
        handleApiError(error);
        return null;
    }
};