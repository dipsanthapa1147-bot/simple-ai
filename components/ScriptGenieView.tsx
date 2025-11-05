
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateScriptStream, transcribeAudio, continueScriptStream, suggestPrompts, generateTts } from '../services/geminiService';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { HistoryIcon } from './icons/HistoryIcon';
import { ApiKeyError } from '../services/errors';
import { ShareIcon } from './icons/ShareIcon';
import { TrashIcon } from './icons/TrashIcon';
import { useRecorder } from '../hooks/useRecorder';
import { MicIcon } from './icons/MicIcon';
import { SaveIcon } from './icons/SaveIcon';
import { EditIcon } from './icons/EditIcon';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { decode, decodeAudioData } from '../utils/helpers';
import { SpeakerIcon } from './icons/SpeakerIcon';
import { StopIcon } from './icons/StopIcon';
import ScriptDiffModal from './ScriptDiffModal';
import { CompareIcon } from './icons/CompareIcon';
import { GeminiIcon } from './icons/GeminiIcon';

const SCRIPT_TYPES = ['Novel', 'YouTube Video', 'Short Film', 'Podcast Ad', 'Educational Video', 'Explainer Video'];
const TONES = ['Informative', 'Humorous', 'Dramatic', 'Inspirational', 'Casual', 'Professional', 'Fantasy'];
const SCRIPT_FORMATS = ['Standard', 'Screenplay', 'Stage Play', 'Comic Book Script', 'Radio Play', 'Lyric Sheet'];
const SCRIPT_STYLES = ['Default', 'Chinese', 'Japanese', 'Korean', 'Indian', 'Western', 'Shakespearean'];
const TEMPLATES_STORAGE_KEY = 'scriptGenieTemplates';
const AUTOSAVE_STORAGE_KEY = 'scriptGenieAutosave';

interface ScriptVersion {
  timestamp: number;
  script: string;
}

interface ScriptTemplate {
  name: string;
  config: {
    scriptType: string;
    tone: string;
    format: string;
    style: string;
    length: number;
    chapters: number;
  };
}

const chunkText = (text: string, maxLength = 7000): string[] => {
    const chunks: string[] = [];
    if (!text) return chunks;
    let remainingText = text;

    while (remainingText.length > 0) {
        if (remainingText.length <= maxLength) {
            chunks.push(remainingText);
            break;
        }

        let chunk = remainingText.substring(0, maxLength);
        let splitIndex = chunk.lastIndexOf('\n\n');
        if (splitIndex === -1) splitIndex = chunk.lastIndexOf('. ');
        if (splitIndex === -1) splitIndex = chunk.lastIndexOf(' ');

        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            splitIndex = maxLength;
        }

        chunks.push(remainingText.substring(0, splitIndex + 1).trim());
        remainingText = remainingText.substring(splitIndex + 1).trim();
    }
    return chunks.filter(c => c.length > 0);
};

const ScriptGenieView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [scriptType, setScriptType] = useState(SCRIPT_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [format, setFormat] = useState(SCRIPT_FORMATS[0]);
  const [style, setStyle] = useState(SCRIPT_STYLES[0]);
  const [length, setLength] = useState(250);
  const [chapters, setChapters] = useState(1);
  const [generatedScript, setGeneratedScript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ScriptVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const hidePreviewTimeout = useRef<number | null>(null);
  const [lastGeneratedChapters, setLastGeneratedChapters] = useState(1);
  const scriptContainerRef = useRef<HTMLPreElement | HTMLTextAreaElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  const [readingState, setReadingState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isStoppingRef = useRef(false);

  const [showDiffModal, setShowDiffModal] = useState(false);
  const [versionToCompare, setVersionToCompare] = useState<ScriptVersion | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);


  const { isRecording, audioBlob, startRecording, stopRecording } = useRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const templatesDropdownRef = useRef<HTMLDivElement>(null);
  const [editingTemplate, setEditingTemplate] = useState<ScriptTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const handleScroll = () => {
    if (scriptContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scriptContainerRef.current;
      setShowScrollToTop(scrollTop > 50);
      setShowScrollToBottom(scrollHeight - scrollTop - clientHeight > 50);
    }
  };

  const scrollToTop = () => {
    scriptContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const scrollToBottom = () => {
    scriptContainerRef.current?.scrollTo({ top: scriptContainerRef.current.scrollHeight, behavior: 'smooth' });
  };

  useEffect(() => {
    const timeout = setTimeout(handleScroll, 100); // Check after render
    return () => clearTimeout(timeout);
  }, [generatedScript, isEditing]);


  // Load autosaved session on mount
  useEffect(() => {
    try {
        const savedStateJSON = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
        if (savedStateJSON) {
            if (window.confirm("An autosaved script was found. Would you like to restore it?")) {
                const savedState = JSON.parse(savedStateJSON);
                setPrompt(savedState.prompt || '');
                setScriptType(savedState.scriptType || SCRIPT_TYPES[0]);
                setTone(savedState.tone || TONES[0]);
                setFormat(savedState.format || SCRIPT_FORMATS[0]);
                setStyle(savedState.style || SCRIPT_STYLES[0]);
                setLength(savedState.length || 250);
                setChapters(savedState.chapters || 1);
                setGeneratedScript(savedState.generatedScript || '');
                setLastGeneratedChapters(savedState.lastGeneratedChapters || 1);
            } else {
                // User chose not to restore, so clear the saved data.
                localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
            }
        }
    } catch (e) {
        console.error("Failed to load autosaved script", e);
        localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  // Debounced autosave effect
  useEffect(() => {
    if (isLoading || isReadOnly || !generatedScript.trim()) {
        return; // Don't save while loading, in read-only mode, or if script is empty
    }

    if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
        const stateToSave = {
            prompt,
            scriptType,
            tone,
            format,
            style,
            length,
            chapters,
            generatedScript,
            lastGeneratedChapters,
        };

        try {
            localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) {
            console.error("Failed to autosave script.", e);
        }
    }, 2000); // Debounce for 2 seconds

    return () => {
        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
        }
    };
  }, [prompt, scriptType, tone, format, style, length, chapters, generatedScript, lastGeneratedChapters, isLoading, isReadOnly]);


  useEffect(() => {
    if (audioBlob) {
      handleTranscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  const handleTranscription = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    try {
      const audioFile = new File([audioBlob], "prompt-recording.webm", { type: audioBlob.type });
      const result = await transcribeAudio(audioFile);
      setPrompt(prev => prev ? `${prev.trim()} ${result}`.trim() : result);
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Sorry, an error occurred during transcription.");
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

  const stopReading = useCallback(() => {
    isStoppingRef.current = true;
    audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) { /* Ignore errors on already stopped sources */ }
    });
    audioSourcesRef.current = [];
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    setReadingState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return stopReading;
  }, [stopReading]);

  const handleToggleReading = async () => {
    if (readingState === 'playing' || readingState === 'loading') {
        stopReading();
        return;
    }

    if (!generatedScript) return;

    setReadingState('loading');
    isStoppingRef.current = false;

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const audioCtx = audioContextRef.current;
    
    const chunks = chunkText(generatedScript);
    let nextStartTime = audioCtx.currentTime;
    let isFirstChunk = true;

    try {
        for (const chunk of chunks) {
            if (isStoppingRef.current) break;

            const audioBase64 = await generateTts(chunk);
            if (audioBase64 && !isStoppingRef.current) {
                const audioData = decode(audioBase64);
                const audioBuffer = await decodeAudioData(audioData, audioCtx, 24000, 1);
                
                if (isStoppingRef.current) break;
                
                if (isFirstChunk) {
                    setReadingState('playing');
                    isFirstChunk = false;
                }
                
                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                source.start(nextStartTime);
                
                audioSourcesRef.current.push(source);
                nextStartTime += audioBuffer.duration;
            }
        }

        if (!isStoppingRef.current) {
            const totalDuration = nextStartTime - audioCtx.currentTime;
            setTimeout(() => {
                if (!isStoppingRef.current) {
                    setReadingState('idle');
                }
            }, Math.max(0, totalDuration * 1000));
        }

    } catch (error) {
        console.error("TTS Error:", error);
        alert("Failed to generate speech. You may have exceeded your API quota.");
        stopReading();
    }
};

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedScriptBase64 = params.get('script');

    if (sharedScriptBase64) {
      try {
        const decodedScript = decodeURIComponent(atob(sharedScriptBase64));
        setGeneratedScript(decodedScript);
        setIsReadOnly(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (error) {
        console.error("Failed to decode shared script:", error);
        setGeneratedScript("Error: Could not load the shared script. The link might be corrupted.");
      }
    }
  }, []);

  const getHistoryKey = (): string | null => {
    if (!prompt.trim()) return null;
    return `script-history:${prompt.trim().toLowerCase()}:${scriptType}:${tone}:${format}:${style}:${length}:${chapters}`;
  };

  useEffect(() => {
    if (isReadOnly) return;
    const key = getHistoryKey();
    if (key) {
      try {
        const storedHistory = localStorage.getItem(key);
        setHistory(storedHistory ? JSON.parse(storedHistory) : []);
      } catch (e) {
        console.error("Failed to parse script history from localStorage", e);
        setHistory([]);
      }
    } else {
      setHistory([]);
    }
    setShowHistory(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, scriptType, tone, format, style, length, chapters, isReadOnly]);

   // Load templates from localStorage on mount
  useEffect(() => {
    try {
      const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (storedTemplates) {
        setTemplates(JSON.parse(storedTemplates));
      }
    } catch (e) {
      console.error("Failed to load templates from localStorage", e);
    }
  }, []);

  // Handle clicking outside the templates dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templatesDropdownRef.current && !templatesDropdownRef.current.contains(event.target as Node)) {
        setShowTemplatesDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const saveScriptToHistory = (script: string) => {
    const key = getHistoryKey();
    if (!key || !script) return;

    const newEntry: ScriptVersion = { timestamp: Date.now(), script };
    setHistory(prevHistory => {
        const updatedHistory = [newEntry, ...prevHistory].slice(0, 10); // Keep max 10 versions
        try {
            localStorage.setItem(key, JSON.stringify(updatedHistory));
        } catch (e) {
            console.error("Failed to save script history to localStorage", e);
        }
        return updatedHistory;
    });
  };

  const closeSaveModal = () => {
    setShowSaveTemplateModal(false);
    setNewTemplateName('');
    setEditingTemplate(null);
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) return;

    const currentConfig = {
      scriptType,
      tone,
      format,
      style,
      length,
      chapters,
    };

    let updatedTemplates;

    if (editingTemplate) {
      // Update existing template
      updatedTemplates = templates.map(t =>
        t.name === editingTemplate.name
          ? { name: newTemplateName.trim(), config: currentConfig }
          : t
      );
    } else {
      // Add new template
      const newTemplate: ScriptTemplate = {
        name: newTemplateName.trim(),
        config: currentConfig
      };
      updatedTemplates = [...templates.filter(t => t.name !== newTemplate.name), newTemplate];
    }

    setTemplates(updatedTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
    closeSaveModal();
  };
  
  const handleEditTemplate = (template: ScriptTemplate) => {
    setEditingTemplate(template);
    setNewTemplateName(template.name);
    setShowTemplatesDropdown(false);
    setShowSaveTemplateModal(true);
  };

  const handleLoadTemplate = (templateName: string) => {
    const template = templates.find(t => t.name === templateName);
    if (template) {
        setScriptType(template.config.scriptType);
        setTone(template.config.tone);
        setFormat(template.config.format);
        setStyle(template.config.style || SCRIPT_STYLES[0]);
        setLength(template.config.length);
        setChapters(template.config.chapters);
        setShowTemplatesDropdown(false);
    }
  };

  const handleDeleteTemplate = (templateName: string) => {
    const updatedTemplates = templates.filter(t => t.name !== templateName);
    setTemplates(updatedTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
  };

  const handleContinueScript = async () => {
    setIsLoading(true);
    stopReading();
    let initialScript = generatedScript;
    let appendedContent = '';
    try {
        const stream = await continueScriptStream(
            generatedScript,
            prompt,
            scriptType,
            tone,
            length,
            format,
            style,
            lastGeneratedChapters + 1,
            chapters
        );

        for await (const chunk of stream) {
            const text = chunk.text;
            appendedContent += text;
            setGeneratedScript(initialScript + appendedContent);
        }

        if (appendedContent.trim()) {
            const finalScript = initialScript + appendedContent;
            saveScriptToHistory(finalScript);
            setLastGeneratedChapters(chapters);
        }
    } catch (error) {
        console.error("Script Continuation Error:", error);
        setGeneratedScript(prev => prev + '\n\n--- ERROR: Could not continue script generation. ---');
    } finally {
        setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return;

    if (!isLoading && !!generatedScript.trim() && chapters > lastGeneratedChapters) {
        handleContinueScript();
        return;
    }

    setIsLoading(true);
    stopReading();
    setGeneratedScript('');
    setShowHistory(false);
    setIsReadOnly(false);
    setIsEditing(false);
    setLastGeneratedChapters(1);

    try {
      const stream = await generateScriptStream(
          prompt, scriptType, tone, length, format, style, chapters
      );
      
      let scriptContent = '';
      for await (const chunk of stream) {
        const text = chunk.text;
        scriptContent += text;
        setGeneratedScript(scriptContent);
      }

      if (scriptContent.trim()) {
        saveScriptToHistory(scriptContent);
        setLastGeneratedChapters(chapters);
      }

    } catch (error) {
        console.error("Script Generation Error:", error);
        setGeneratedScript('Sorry, an error occurred while generating the script.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveScript = () => {
    if (!generatedScript) return;

    const blob = new Blob([generatedScript], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const fileName = prompt.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 30) || 'generated-script';
    link.download = `${fileName}.md`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };
  
  const handleShareScript = () => {
    if (!generatedScript || isCopied) return;

    try {
      const encodedScript = btoa(encodeURIComponent(generatedScript));
      const shareUrl = `${window.location.origin}${window.location.pathname}?script=${encodedScript}`;
      
      navigator.clipboard.writeText(shareUrl).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }).catch(err => {
        console.error("Failed to copy URL:", err);
        alert("Could not copy link to clipboard.");
      });
    } catch (error) {
      console.error("Failed to encode script for sharing:", error);
      alert("An error occurred while creating the share link.");
    }
  };

  const handleRevertToVersion = (scriptToRevert: string) => {
    setGeneratedScript(scriptToRevert);
    setShowHistory(false);
  };
  
  const handleCompareVersion = (version: ScriptVersion) => {
    setVersionToCompare(version);
    setShowDiffModal(true);
    setShowHistory(false); // Close history dropdown
  };

  const handleRevertFromDiff = () => {
    if (versionToCompare) {
        setGeneratedScript(versionToCompare.script);
    }
    setShowDiffModal(false);
    setVersionToCompare(null);
  };


  const handleHistoryItemMouseEnter = (index: number) => {
    if (hidePreviewTimeout.current) {
      clearTimeout(hidePreviewTimeout.current);
    }
    setHoveredHistoryIndex(index);
  };

  const handleHistoryContainerMouseLeave = () => {
    hidePreviewTimeout.current = window.setTimeout(() => {
      setHoveredHistoryIndex(null);
    }, 300);
  };

  const cancelHidePreview = () => {
    if (hidePreviewTimeout.current) {
      clearTimeout(hidePreviewTimeout.current);
    }
  };

  const handleStartNew = () => {
    setGeneratedScript('');
    setHistory([]);
    setLastGeneratedChapters(1);
    setPrompt('');
    setIsEditing(false);
    stopReading();
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
  };

  const handleSuggestPrompts = async () => {
    setIsSuggesting(true);
    setSuggestedPrompts([]);
    try {
      const prompts = await suggestPrompts(scriptType, tone);
      if (prompts) {
        setSuggestedPrompts(prompts);
      }
    } catch (error) {
        console.error("Prompt suggestion error:", error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleToggleEditing = () => {
    if (isEditing) {
        saveScriptToHistory(generatedScript);
    }
    setIsEditing(!isEditing);
  };
  
  const isContinuationMode = !isLoading && !!generatedScript.trim() && chapters > lastGeneratedChapters;
  const isUiDisabled = isLoading || isTranscribing || isReadOnly;
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const lengthLabel = chapters > 1 ? "Length per Chapter (words)" : "Length (words)";
  
  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 lg:space-y-0 grid lg:grid-cols-12 lg:gap-8">
      {/* Left Column: Controls */}
      <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8 self-start">
        <div>
            <h2 className="text-2xl font-semibold mb-2">Script Genie</h2>
            <p className="text-gray-400">Craft the perfect script. Just provide the topic and set the options.</p>
        </div>

        <div className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg space-y-4">
            <h3 className="font-semibold text-lg text-gray-200 border-b border-gray-600 pb-2 mb-4">1. Configure Your Script</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="scriptType" className="block text-sm font-medium text-gray-300 mb-1">Script Type</label>
                    <select id="scriptType" value={scriptType} onChange={(e) => setScriptType(e.target.value)} className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isContinuationMode || isEditing}>
                        {SCRIPT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="tone" className="block text-sm font-medium text-gray-300 mb-1">Tone</label>
                    <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isContinuationMode || isEditing}>
                        {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="format" className="block text-sm font-medium text-gray-300 mb-1">Format</label>
                    <select id="format" value={format} onChange={(e) => setFormat(e.target.value)} className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isContinuationMode || scriptType === 'Novel' || isEditing}>
                        {SCRIPT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="style" className="block text-sm font-medium text-gray-300 mb-1">Style</label>
                    <select id="style" value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isContinuationMode || isEditing}>
                        {SCRIPT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="length" className="block text-sm font-medium text-gray-300 mb-1">{lengthLabel}</label>
                    <input type="number" id="length" value={length} onChange={(e) => setLength(Number(e.target.value))} min="50" step="50" className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isContinuationMode || isEditing}/>
                </div>
                <div>
                    <label htmlFor="chapters" className="block text-sm font-medium text-gray-300 mb-1">Chapters/Volumes</label>
                    <input type="number" id="chapters" value={chapters} onChange={(e) => setChapters(Math.max(1, Number(e.target.value)))} min="1" step="1" className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50" disabled={isUiDisabled || isEditing}/>
                </div>
            </div>
             <div className="flex items-center justify-end space-x-2 pt-2">
                <div className="relative" ref={templatesDropdownRef}>
                    <button onClick={() => setShowTemplatesDropdown(p => !p)} disabled={isUiDisabled || isEditing} className="bg-teal-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-teal-700 transition-colors text-sm flex items-center space-x-2 disabled:bg-gray-600">
                        <span>Templates</span>
                    </button>
                    {showTemplatesDropdown && (
                         <div className="absolute right-0 top-full mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 max-h-80 flex flex-col">
                            <div className="p-2 border-b border-gray-700">
                                <input type="text" placeholder="Search templates..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} className="w-full bg-gray-900 text-gray-200 rounded-md p-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none" />
                            </div>
                            <div className="overflow-y-auto">
                                {filteredTemplates.length > 0 ? (
                                    <ul>{filteredTemplates.map((template) => (
                                        <li key={template.name} className="flex items-center justify-between p-2 hover:bg-gray-700/50">
                                            <button onClick={() => handleLoadTemplate(template.name)} className="text-left flex-grow text-sm text-gray-300">{template.name}</button>
                                            <div className="flex items-center flex-shrink-0">
                                                <button onClick={() => handleEditTemplate(template)} className="p-1 text-gray-500 hover:text-blue-400" title="Edit Template"><EditIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleDeleteTemplate(template.name)} className="p-1 text-gray-500 hover:text-red-400 ml-1" title="Delete Template"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </li>))}
                                    </ul>
                                ) : ( <p className="p-4 text-sm text-gray-500 text-center">No templates found.</p> )}
                            </div>
                        </div>
                    )}
                </div>
                <button onClick={() => { setEditingTemplate(null); setShowSaveTemplateModal(true);}} disabled={isUiDisabled || isEditing} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-sm flex items-center space-x-2 disabled:bg-gray-600">
                    <SaveIcon className="w-4 h-4" /> <span>Save as Template</span>
                </button>
             </div>
        </div>

        <div className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg space-y-4">
             <h3 className="font-semibold text-lg text-gray-200 border-b border-gray-600 pb-2 mb-4">2. Enter Your Topic</h3>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-300">What is the script about?</label>
                    <button onClick={handleSuggestPrompts} disabled={isUiDisabled || isContinuationMode || isSuggesting || isEditing} className="text-sm text-blue-400 hover:text-blue-300 flex items-center space-x-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isSuggesting ? ( <SpinnerIcon className="w-4 h-4 animate-spin" /> ) : ( <SparklesIcon className="w-4 h-4" /> )}
                        <span>{isSuggesting ? 'Suggesting...' : 'Suggest Prompts'}</span>
                    </button>
                </div>
                <div className="relative">
                    <textarea id="prompt" value={prompt} onChange={(e) => { setPrompt(e.target.value); if (suggestedPrompts.length > 0) { setSuggestedPrompts([]); }}} placeholder="e.g., The benefits of using AI in daily life." className="w-full h-36 bg-gray-700 text-gray-200 rounded-lg p-3 pr-16 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 resize-none" disabled={isUiDisabled || isContinuationMode || isEditing} />
                    <button type="button" onClick={toggleRecording} disabled={isUiDisabled || isContinuationMode || isEditing} className={`absolute top-3 right-3 p-2 rounded-full transition-colors ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'} disabled:opacity-50 disabled:cursor-not-allowed`} title={isRecording ? 'Stop recording' : 'Record prompt'}>
                        {isTranscribing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <MicIcon className="w-5 h-5" />}
                    </button>
                    <div className="absolute bottom-2 right-3 text-xs text-gray-400 pointer-events-none">Word Count: {wordCount}</div>
                </div>
                {suggestedPrompts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 animate-slide-in-left" style={{animationDuration: '0.3s'}}>
                        {suggestedPrompts.map((p, i) => ( <button key={i} onClick={() => { setPrompt(p); setSuggestedPrompts([]); }} className="bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm px-3 py-1 rounded-full transition-colors">{p}</button>))}
                    </div>
                )}
            </div>

             {isLoading ? (
                <button disabled className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold cursor-not-allowed flex justify-center items-center">
                    <SpinnerIcon className="w-6 h-6 mr-2 animate-spin" />
                    <span>{isContinuationMode ? 'Continuing...' : 'Generating...'}</span>
                </button>
            ) : (
                <div className="flex items-center space-x-4">
                    <button onClick={handleSubmit} disabled={isUiDisabled || !prompt.trim() || (chapters <= lastGeneratedChapters && !!generatedScript.trim()) || isEditing} className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex justify-center items-center">
                        {isTranscribing ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : (isContinuationMode ? `Continue Script (${lastGeneratedChapters} → ${chapters})` : 'Generate Script')}
                    </button>
                    {isContinuationMode && ( <button onClick={handleStartNew} className="flex-shrink-0 bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors">Start New</button>)}
                </div>
            )}
        </div>
      </div>

      {/* Right Column: Script Output */}
      <div className="lg:col-span-8">
        {generatedScript ? (
            <div className="p-4 bg-gray-900/50 rounded-lg relative border border-gray-700/50">
                {isReadOnly && (<div className="mb-3 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center text-yellow-300"><p>You are viewing a shared script (read-only).</p></div>)}
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xl font-semibold">Generated Script</h3>
                    <div className="flex items-center flex-wrap gap-2">
                        <button onClick={handleToggleReading} disabled={isEditing} className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-cyan-700 transition-colors text-sm flex items-center space-x-2 disabled:bg-gray-600">
                            {readingState === 'loading' && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                            {readingState === 'playing' && <StopIcon className="w-4 h-4" />}
                            {readingState === 'idle' && <SpeakerIcon className="w-4 h-4" />}
                            <span> {readingState === 'loading' ? 'Generating...' : readingState === 'playing' ? 'Stop' : 'Read Aloud'}</span>
                        </button>
                        {!isReadOnly && (<button onClick={handleToggleEditing} className={`px-3 py-1.5 rounded-lg font-semibold transition-colors text-sm flex items-center space-x-2 ${isEditing ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'}`}>
                            {isEditing ? <SaveIcon className="w-4 h-4" /> : <EditIcon className="w-4 h-4" />}
                            <span>{isEditing ? 'Save' : 'Edit'}</span>
                        </button>)}
                        <button onClick={handleShareScript} disabled={isCopied || isEditing} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition-colors text-sm flex items-center space-x-2 disabled:bg-purple-400">
                            <ShareIcon className="w-4 h-4" /> <span>{isCopied ? 'Copied!' : 'Share'}</span>
                        </button>
                        {history.length > 0 && !isReadOnly && (
                            <div className="relative" onMouseEnter={cancelHidePreview} onMouseLeave={handleHistoryContainerMouseLeave}>
                                <button onClick={() => setShowHistory(prev => !prev)} disabled={isEditing} className="bg-gray-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2 disabled:opacity-50">
                                    <HistoryIcon className="w-4 h-4" /> <span>History</span>
                                </button>
                                {showHistory && hoveredHistoryIndex !== null && history[hoveredHistoryIndex] && (
                                    <div className="absolute bottom-0 right-full mr-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 p-4">
                                        <h4 className="font-bold text-sm mb-2 text-gray-300">Preview</h4>
                                        <pre className="whitespace-pre-wrap font-sans text-xs text-gray-400 max-h-64 overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]">{history[hoveredHistoryIndex].script}</pre>
                                    </div>
                                )}
                                {showHistory && (
                                    <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10">
                                        <ul className="py-1 max-h-60 overflow-y-auto">
                                            {history.map((item, index) => (
                                                <li key={item.timestamp} onMouseEnter={() => handleHistoryItemMouseEnter(index)} className="flex items-center justify-between px-4 py-2 hover:bg-gray-700">
                                                    <span className="text-sm text-gray-300 cursor-pointer flex-grow" onClick={() => handleRevertToVersion(item.script)} title={`Revert to this version from ${new Date(item.timestamp).toLocaleString()}`}>Version {history.length - index}</span>
                                                    <button onClick={() => handleCompareVersion(item)} className="ml-2 p-1 text-gray-400 hover:text-white" title="Compare with current version"><CompareIcon className="w-4 h-4" /></button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={handleSaveScript} disabled={isEditing} className="bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700 transition-colors text-sm flex items-center space-x-2 disabled:opacity-50">
                            <DownloadIcon className="w-4 h-4" /> <span>Save</span>
                        </button>
                    </div>
                </div>
                {isEditing ? (
                    <textarea value={generatedScript} onChange={(e) => setGeneratedScript(e.target.value)} ref={scriptContainerRef as React.Ref<HTMLTextAreaElement>} onScroll={handleScroll} className="w-full bg-gray-800 rounded-md p-2 font-sans text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" style={{ height: "65vh" }} autoFocus />
                ) : (
                    <pre ref={scriptContainerRef as React.Ref<HTMLPreElement>} onScroll={handleScroll} className="whitespace-pre-wrap font-sans text-gray-200 h-[65vh] overflow-y-auto">{generatedScript}</pre>
                )}
                <div className="absolute bottom-6 right-6 flex flex-col space-y-2">
                    {showScrollToTop && ( <button onClick={scrollToTop} className="bg-gray-700/80 backdrop-blur-sm hover:bg-gray-600 text-white rounded-full p-2 transition-opacity" title="Scroll to top"><ArrowUpIcon className="w-5 h-5" /></button>)}
                    {showScrollToBottom && ( <button onClick={scrollToBottom} className="bg-gray-700/80 backdrop-blur-sm hover:bg-gray-600 text-white rounded-full p-2 transition-opacity" title="Scroll to bottom"><ArrowDownIcon className="w-5 h-5" /></button>)}
                </div>
            </div>
        ) : (
             <div className="h-full flex flex-col justify-center items-center text-center text-gray-500 bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-700 min-h-[50vh] lg:min-h-full">
                <GeminiIcon className="w-24 h-24 mb-6 text-gray-600"/>
                <h3 className="text-2xl font-semibold text-gray-400">Your script will appear here</h3>
                <p className="mt-2 max-w-sm">Configure the settings on the left, enter your topic, and click "Generate Script" to begin.</p>
            </div>
        )}
      </div>

      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center" onClick={closeSaveModal}>
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">{editingTemplate ? 'Edit Template' : 'Save Template'}</h3>
                <input type="text" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Enter template name..." className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-4" />
                <div className="flex justify-end space-x-3">
                    <button onClick={closeSaveModal} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500">Cancel</button>
                    <button onClick={handleSaveTemplate} disabled={!newTemplateName.trim()} className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500">{editingTemplate ? 'Update' : 'Save'}</button>
                </div>
            </div>
        </div>
      )}
      
      {showDiffModal && versionToCompare && (
          <ScriptDiffModal
              currentScript={generatedScript}
              historicalScript={versionToCompare.script}
              onClose={() => setShowDiffModal(false)}
              onRevert={handleRevertFromDiff}
              timestamp={versionToCompare.timestamp}
          />
      )}
    </div>
  );
};

export default ScriptGenieView;
