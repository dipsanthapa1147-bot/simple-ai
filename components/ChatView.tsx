
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ChatMessage, SavedConversation, ChatMode } from '../types';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { SendIcon } from './icons/SendIcon';
import { UserIcon } from './icons/UserIcon';
import { GeminiIcon } from './icons/GeminiIcon';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { AttachmentIcon } from './icons/AttachmentIcon';
import { XIcon } from './icons/XIcon';
import { RegenerateIcon } from './icons/RegenerateIcon';
import { fileToBase64 } from '../utils/helpers';
import ChatHistoryModal from './ChatHistoryModal';
import { HistoryIcon } from './icons/HistoryIcon';
import { PlusIcon } from './icons/PlusIcon';
import { generateGroundedContent, transcribeAudio } from '../services/geminiService';
import { WebIcon } from './icons/WebIcon';
import { ImageIcon } from './icons/ImageIcon';
import { useRecorder } from '../hooks/useRecorder';
import { MicIcon } from './icons/MicIcon';
import { TypingIndicator } from './TypingIndicator';

const CHAT_HISTORY_STORAGE_KEY = 'geminiChatHistory';

const chatModes: { id: ChatMode; label: string; description: string }[] = [
    { id: 'low-latency', label: 'Low Latency', description: 'Fast responses for general conversation. (gemini-2.5-flash)' },
    { id: 'thinking', label: 'Deeper Thinking', description: 'More thoughtful responses for complex tasks. (gemini-2.5-pro)' },
    { id: 'search-grounded', label: 'Search Grounded', description: 'Answers grounded in up-to-date Google Search results.' },
];

interface ModeSelectorProps {
  currentMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  disabled: boolean;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ currentMode, onModeChange, disabled }) => {
    return (
        <div className="flex justify-center items-stretch space-x-2 mb-4 p-1 bg-gray-900/50 rounded-lg">
            {chatModes.map(mode => (
                <label key={mode.id} className={`relative flex-1 p-2 rounded-md text-center cursor-pointer transition-colors duration-300 ${currentMode === mode.id ? 'bg-blue-600/30 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>
                    <input
                        type="radio"
                        name="chat-mode"
                        value={mode.id}
                        checked={currentMode === mode.id}
                        onChange={() => onModeChange(mode.id)}
                        disabled={disabled}
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                    />
                    <div className="flex flex-col items-center">
                        <span className="font-semibold text-sm">{mode.label}</span>
                        <span className="text-xs text-gray-500 hidden md:block mt-1">{mode.description}</span>
                    </div>
                </label>
            ))}
        </div>
    );
};


const ChatView: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { isRecording, audioBlob, startRecording, stopRecording } = useRecorder();
    const [isTranscribing, setIsTranscribing] = useState(false);

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [chatMode, setChatMode] = useState<ChatMode>('low-latency');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
            if (storedHistory) {
                setSavedConversations(JSON.parse(storedHistory));
            }
        } catch (e) {
            console.error("Failed to load chat history from localStorage", e);
        }
    }, []);
    
    useEffect(() => {
        if (audioBlob) {
            handleTranscription();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioBlob]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    const handleSendMessage = async (messageText?: string, messageHistory?: ChatMessage[]) => {
        const textToSend = messageText || input;
        if (!textToSend.trim() && !imageFile) return;

        setIsLoading(true);
        setError(null);

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            parts: [{ text: textToSend }],
            imagePreview: imagePreview || undefined,
        };
        
        const currentMessages = [...(messageHistory || messages), userMessage];
        setMessages(currentMessages);
        setInput('');
        const attachedImageFile = imageFile; // Capture the image file
        removeImage();

        if (chatMode === 'search-grounded') {
            try {
                const response = await generateGroundedContent(textToSend, attachedImageFile, messages);
                const modelResponse: ChatMessage = {
                    id: `model-${Date.now()}`,
                    role: 'model',
                    parts: [{ text: response.text }],
                    groundingSources: response.groundingSources,
                };
                setMessages([...currentMessages, modelResponse]);
            } catch (err: any) {
                console.error("Chat error:", err);
                setError("An error occurred. Please try again.");
                setMessages(prev => prev.filter(m => m.id !== userMessage.id));
            } finally {
                setIsLoading(false);
            }
        } else { // Streaming modes
            const modelResponse: ChatMessage = {
                id: `model-${Date.now()}`,
                role: 'model',
                parts: [{ text: '' }],
                isStreaming: true
            };
            setMessages([...currentMessages, modelResponse]);
            
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const modelName = chatMode === 'thinking' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
                
                const history = currentMessages.filter(m => m.id !== userMessage.id && !m.isStreaming).map(({ role, parts }) => ({
                    role,
                    parts: parts.map(p => ({ text: p.text }))
                }));

                const chat = ai.chats.create({ model: modelName, history });

                let messagePayload: any = { parts: [{ text: textToSend }] };
                if (attachedImageFile) {
                    const base64Image = await fileToBase64(attachedImageFile);
                    messagePayload.parts.push({
                        inlineData: { data: base64Image, mimeType: attachedImageFile.type }
                    });
                }

                const stream = await chat.sendMessageStream(messagePayload);
                
                let fullResponse = '';
                for await (const chunk of stream) {
                    const chunkText = chunk.text;
                    fullResponse += chunkText;
                    setMessages(prev => prev.map((msg) => 
                        msg.id === modelResponse.id
                            ? { ...msg, parts: [{ text: fullResponse }] } 
                            : msg
                    ));
                }

                setMessages(prev => prev.map((msg) => 
                    msg.id === modelResponse.id
                        ? { ...msg, isStreaming: false } 
                        : msg
                ));

            } catch (err: any) {
                console.error("Chat error:", err);
                setError("An error occurred. Please try again.");
                 setMessages(prev => prev.filter(m => m.id !== userMessage.id && m.id !== modelResponse.id));
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const handleModeChange = (newMode: ChatMode) => {
        if (newMode !== chatMode) {
            if (messages.length > 0 && !window.confirm("Switching modes will start a new chat. Are you sure?")) {
                return;
            }
            setChatMode(newMode);
            handleNewChat();
        }
    };

    const handleRegenerate = async () => {
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) return;

        const lastUserMessage = messages[lastUserMessageIndex];
        const historyUpToLastUserMessage = messages.slice(0, lastUserMessageIndex);

        setMessages(historyUpToLastUserMessage);
        
        // This is a bit of a hack to ensure state updates before resending
        setTimeout(() => handleSendMessage(lastUserMessage.parts[0].text, historyUpToLastUserMessage), 100);
    };

    // --- History Management ---
    const updateStoredHistory = (updatedHistory: SavedConversation[]) => {
        setSavedConversations(updatedHistory);
        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
    };

    const handleSaveConversation = (name: string) => {
        const newConversation: SavedConversation = {
            id: `convo-${Date.now()}`,
            name,
            timestamp: Date.now(),
            messages: messages.filter(m => !m.isStreaming), // Don't save streaming messages
        };
        updateStoredHistory([newConversation, ...savedConversations]);
    };

    const handleLoadConversation = (id: string) => {
        const conversation = savedConversations.find(c => c.id === id);
        if (conversation) {
            setMessages(conversation.messages);
            setShowHistory(false);
        }
    };

    const handleRenameConversation = (id: string, newName: string) => {
        const updated = savedConversations.map(c => c.id === id ? { ...c, name: newName } : c);
        updateStoredHistory(updated);
    };

    const handleDeleteConversation = (id: string) => {
        const updated = savedConversations.filter(c => c.id !== id);
        updateStoredHistory(updated);
    };

    const handleNewChat = () => {
        setMessages([]);
        setInput('');
        removeImage();
        setError(null);
    }
    
    // --- Voice Input ---
    const handleTranscription = async () => {
        if (!audioBlob) return;
        setIsTranscribing(true);
        setError(null);
        try {
            const audioFile = new File([audioBlob], "chat-recording.webm", { type: audioBlob.type });
            const result = await transcribeAudio(audioFile);
            if (result) {
                setInput(prev => prev ? `${prev.trim()} ${result}`.trim() : result);
            }
        } catch (err: any) {
            console.error("Transcription error:", err);
            setError("An error occurred during transcription.");
        } finally {
            setIsTranscribing(false);
        }
    };
    
    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };


    // --- Drag and Drop Handlers ---
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (isLoading || isUiDisabled) return;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                setImageFile(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreview(reader.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const isUiDisabled = isLoading || isTranscribing;

    return (
        <div 
            className="relative flex flex-col h-[75vh]"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
             {isDragging && (
                <div className="absolute inset-0 bg-blue-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg border-4 border-dashed border-blue-400 pointer-events-none">
                    <ImageIcon className="w-24 h-24 text-blue-300 mb-4" />
                    <p className="text-2xl font-bold text-white">Drop image to attach</p>
                </div>
            )}
            <ModeSelector currentMode={chatMode} onModeChange={handleModeChange} disabled={isLoading} />
            <div className="flex-grow overflow-y-auto pr-4 space-y-6">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 h-full flex flex-col justify-center items-center">
                        <GeminiIcon className="w-16 h-16 mb-4 text-gray-600"/>
                        <h2 className="text-2xl font-semibold text-gray-400">How can I help you today?</h2>
                    </div>
                )}
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} onRegenerate={handleRegenerate} isLastMessage={msg.id === messages[messages.length - 1]?.id} isLoading={isLoading} />
                ))}
                <div ref={messagesEndRef} />
            </div>
            {error && <p className="text-red-400 mt-2 text-center">{error}</p>}
            <div className="mt-6 flex-shrink-0">
                <div className="flex justify-end space-x-2 mb-2">
                     <button
                        onClick={handleNewChat}
                        disabled={isUiDisabled}
                        className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="New Chat"
                    >
                        <PlusIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setShowHistory(true)}
                        disabled={isUiDisabled}
                        className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Chat History"
                    >
                        <HistoryIcon className="w-5 h-5" />
                    </button>
                </div>
                {imagePreview && (
                    <div className="relative w-24 h-24 mb-2">
                        <img src={imagePreview} alt="upload preview" className="w-full h-full object-cover rounded-lg" />
                        <button onClick={removeImage} className="absolute -top-2 -right-2 bg-gray-700 rounded-full p-1 text-white hover:bg-gray-600">
                            <XIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if(!isUiDisabled) handleSendMessage();
                            }
                        }}
                        placeholder="Type your message, or drag & drop an image..."
                        className="w-full h-24 bg-gray-700 text-gray-200 rounded-lg p-3 pr-36 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 resize-none"
                        disabled={isUiDisabled}
                    />
                    <div className="absolute top-3 right-3 flex items-center space-x-2">
                        <button
                            onClick={toggleRecording}
                            disabled={isUiDisabled}
                            className={`p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-600/50 animate-pulse' : ''}`}
                            title={isRecording ? 'Stop recording' : 'Voice input'}
                        >
                            {isTranscribing ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <MicIcon className="w-6 h-6" />}
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUiDisabled}
                            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Attach image"
                        >
                            <AttachmentIcon className="w-6 h-6" />
                        </button>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="hidden"
                            disabled={isUiDisabled}
                        />
                        <button
                            onClick={() => handleSendMessage()}
                            disabled={isUiDisabled || (!input.trim() && !imageFile)}
                            className="bg-blue-600 text-white p-3 rounded-full font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <SendIcon className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>
            {showHistory && (
                <ChatHistoryModal
                    isOpen={showHistory}
                    onClose={() => setShowHistory(false)}
                    conversations={savedConversations}
                    onSave={handleSaveConversation}
                    onLoad={handleLoadConversation}
                    onRename={handleRenameConversation}
                    onDelete={handleDeleteConversation}
                    currentChatIsEmpty={messages.length === 0}
                />
            )}
        </div>
    );
};

const Sources: React.FC<{ sources: { uri: string; title: string }[] }> = ({ sources }) => {
    if (!sources || sources.length === 0) return null;
    return (
        <div className="mt-3 pt-3 border-t border-gray-600">
            <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center"><WebIcon className="w-4 h-4 mr-2" />Sources:</h4>
            <ol className="list-decimal list-inside text-sm space-y-1">
                {sources.map((source, index) => (
                    <li key={index}>
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all" title={source.uri}>
                            {source.title || new URL(source.uri).hostname}
                        </a>
                    </li>
                ))}
            </ol>
        </div>
    );
};


interface MessageBubbleProps {
    message: ChatMessage;
    onRegenerate: () => void;
    isLastMessage: boolean;
    isLoading: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRegenerate, isLastMessage, isLoading }) => {
    const [isCopied, setIsCopied] = useState(false);
    const textContent = message.parts.map(p => p.text).join('\n');

    const handleCopy = () => {
        navigator.clipboard.writeText(textContent).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };
    
    const isModel = message.role === 'model';

    return (
        <div className={`flex items-start gap-4 ${isModel ? 'justify-start' : 'justify-end'}`}>
            <div className={`flex items-start gap-4 ${!isModel && 'flex-row-reverse'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isModel ? 'bg-purple-600' : 'bg-blue-600'}`}>
                    {isModel ? <GeminiIcon className="w-5 h-5 text-white" /> : <UserIcon className="w-5 h-5 text-white" />}
                </div>
                <div className={`p-4 rounded-lg max-w-2xl ${isModel ? 'bg-gray-700/50' : 'bg-blue-900/50'}`}>
                    {message.imagePreview && <img src={message.imagePreview} alt="user upload" className="max-w-xs rounded-lg mb-2" />}
                    
                    {isModel && message.isStreaming && !textContent.trim() ? (
                        <TypingIndicator />
                    ) : (
                        <div className="prose prose-invert prose-p:text-gray-200 prose-li:text-gray-200 max-w-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code: CodeBlock
                                }}
                            >
                                {textContent}
                            </ReactMarkdown>
                            {message.isStreaming && <span className="inline-block w-2 h-4 bg-gray-200 animate-pulse ml-1"></span>}
                        </div>
                    )}

                     {isModel && <Sources sources={message.groundingSources || []} />}
                    {isModel && !message.isStreaming && textContent && (
                        <div className="mt-3 flex items-center space-x-2">
                            <button onClick={handleCopy} className="text-gray-400 hover:text-white" title="Copy">
                                {isCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                            </button>
                            {isLastMessage && !isLoading && (
                                <button onClick={onRegenerate} className="text-gray-400 hover:text-white" title="Regenerate response">
                                    <RegenerateIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChatView;
