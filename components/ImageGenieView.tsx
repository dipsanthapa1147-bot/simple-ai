
import React, { useState, useRef, useEffect } from 'react';
import { generateImage, analyzeImage, analyzeVideo } from '../services/geminiService';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { ApiKeyError } from '../services/errors';
import { DownloadIcon } from './icons/DownloadIcon';
import { TrashIcon } from './icons/TrashIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateImageThumbnail, generateVideoThumbnail } from '../utils/helpers';
import { PlayIcon } from './icons/PlayIcon';
import { UploadIcon } from './icons/UploadIcon';

type Mode = 'generate' | 'analyze';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type MediaType = 'image' | 'video';

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: 'Square' },
  { value: '16:9', label: 'Landscape' },
  { value: '9:16', label: 'Portrait' },
  { value: '4:3', label: 'Standard' },
  { value: '3:4', label: 'Tall' },
];

interface ImageHistoryEntry {
  id: number;
  prompt: string;
  imageUrl: string;
}

interface AnalysisHistoryEntry {
  id: number;
  prompt: string;
  result: string;
  imageThumbnail: string; // data URL for thumbnail in list
  originalImage: string;   // data URL for full preview
  mediaType: MediaType;
}

const IMAGE_HISTORY_KEY = 'imageGenieHistory';
const IMAGE_ANALYSIS_HISTORY_KEY = 'imageAnalysisHistory';

const ImagePlaceholderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="9" cy="9" r="2"></circle>
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
  </svg>
);

const ImageGenieView: React.FC = () => {
  const [mode, setMode] = useState<Mode>('generate');
  const [prompt, setPrompt] = useState('');
  const [analysisPrompt, setAnalysisPrompt] = useState('Describe this in detail.');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ImageHistoryEntry[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(IMAGE_HISTORY_KEY);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
      const storedAnalysisHistory = localStorage.getItem(IMAGE_ANALYSIS_HISTORY_KEY);
      if (storedAnalysisHistory) {
        setAnalysisHistory(JSON.parse(storedAnalysisHistory));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);
  
  const updateHistory = (newHistory: ImageHistoryEntry[]) => {
    setHistory(newHistory);
    localStorage.setItem(IMAGE_HISTORY_KEY, JSON.stringify(newHistory));
  };

  const updateAnalysisHistory = (newHistory: AnalysisHistoryEntry[]) => {
    setAnalysisHistory(newHistory);
    localStorage.setItem(IMAGE_ANALYSIS_HISTORY_KEY, JSON.stringify(newHistory));
  };

  const handleProcessFile = (file: File | null | undefined) => {
    if (!file) return;
    setResult(null);
    if (file.type.startsWith('image/')) {
        setMediaType('image');
        setMediaFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setMediaPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
        setMediaType('video');
        setMediaFile(file);
        setIsLoading(true); // Show loader for thumbnail generation
        generateVideoThumbnail(file)
            .then(thumbnailUrl => setMediaPreview(thumbnailUrl))
            .catch(err => {
                console.error("Thumbnail generation failed:", err);
                setResult("Error: Could not create a thumbnail for the video.");
                setMediaType(null);
                setMediaFile(null);
            })
            .finally(() => setIsLoading(false));
    } else {
        setResult("Unsupported file type. Please upload an image or video.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleProcessFile(e.target.files?.[0]);
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
    if (isLoading) return;
    handleProcessFile(e.dataTransfer.files?.[0]);
  };


  const handleSubmit = async () => {
    setIsLoading(true);
    setResult(null);
    try {
      if (mode === 'generate') {
        if (!prompt) return;
        const imageUrl = await generateImage(prompt, aspectRatio);
        setResult(imageUrl);
        const newEntry: ImageHistoryEntry = { id: Date.now(), prompt, imageUrl };
        updateHistory([newEntry, ...history].slice(0, 10)); // Keep last 10
      } else { // Analyze Mode
        if (!mediaFile || !analysisPrompt) return;
        
        let analysisText = '';
        if (mediaType === 'image') {
          analysisText = await analyzeImage(analysisPrompt, mediaFile);
        } else if (mediaType === 'video') {
          analysisText = await analyzeVideo(analysisPrompt, mediaFile);
        } else {
          return;
        }

        setResult(analysisText);

        if (analysisText && !analysisText.toLowerCase().includes('error') && !analysisText.toLowerCase().includes('invalid')) {
            try {
                let thumb: string, original: string;
                if (mediaType === 'image') {
                    thumb = await generateImageThumbnail(mediaFile);
                    original = mediaPreview!;
                } else { // video
                    thumb = mediaPreview!;
                    original = mediaPreview!;
                }

                const newEntry: AnalysisHistoryEntry = {
                    id: Date.now(),
                    prompt: analysisPrompt,
                    result: analysisText,
                    imageThumbnail: thumb,
                    originalImage: original,
                    mediaType: mediaType!
                };
                updateAnalysisHistory([newEntry, ...analysisHistory].slice(0, 10));
            } catch (thumbError) {
                console.error("Could not create thumbnail for analysis history:", thumbError);
            }
        }
      }
    } catch (error) {
        console.error(`${mode} error:`, error);
        setResult(`An error occurred. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetState = () => {
      setPrompt('');
      setAnalysisPrompt('Describe this in detail.');
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      setResult(null);
      setIsLoading(false);
      if(fileInputRef.current) fileInputRef.current.value = "";
  }
  
  const switchMode = (newMode: Mode) => {
      setMode(newMode);
      resetState();
  }
  
  const handleReusePrompt = (p: string) => {
      switchMode('generate');
      setTimeout(() => {
        setPrompt(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 0);
  };
  
  const handleClearHistory = () => {
      if(window.confirm("Are you sure you want to clear the image generation history?")) {
        updateHistory([]);
      }
  };

  const handleClearAnalysisHistory = () => {
    if(window.confirm("Are you sure you want to clear the analysis history?")) {
      updateAnalysisHistory([]);
    }
  };

  const handleLoadAnalysis = (item: AnalysisHistoryEntry) => {
    setMode('analyze');
    setResult(item.result);
    setMediaPreview(item.originalImage);
    setMediaType(item.mediaType);
    setAnalysisPrompt(item.prompt);
    setPrompt('');
    setMediaFile(null); 
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isUiDisabled = isLoading;
  const historyTitle = mode === 'generate' ? "Generation History" : "Analysis History";
  const hasHistory = (mode === 'generate' && history.length > 0) || (mode === 'analyze' && analysisHistory.length > 0);
  const handleClear = mode === 'generate' ? handleClearHistory : handleClearAnalysisHistory;

  return (
    <div className="space-y-8">
      <div className="flex justify-center mb-6 border-b border-gray-700">
        <button onClick={() => switchMode('generate')} className={`px-4 py-2 text-lg font-medium ${mode === 'generate' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}>Generate</button>
        <button onClick={() => switchMode('analyze')} className={`px-4 py-2 text-lg font-medium ${mode === 'analyze' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}>Analyze</button>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left Column: Controls */}
        <div className="space-y-6">
          {mode === 'generate' ? (
            <>
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">Your Prompt</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A cat astronaut riding a rocket through a cheese galaxy"
                  className="w-full h-32 bg-gray-700 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  disabled={isUiDisabled}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
                <div className="flex flex-wrap gap-2">
                  {ASPECT_RATIOS.map(ratio => (
                    <button key={ratio.value} onClick={() => setAspectRatio(ratio.value)} disabled={isUiDisabled} className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${aspectRatio === ratio.value ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                      {ratio.label} ({ratio.value})
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : ( // Analyze Mode
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Image or Video to Analyze</label>
                <div 
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className={`relative w-full p-6 border-2 border-dashed rounded-lg text-center transition-colors ${isDragging ? 'border-blue-500' : 'border-gray-600'} ${isUiDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-blue-500'}`} 
                  onClick={() => !isUiDisabled && fileInputRef.current?.click()}
                >
                  {isDragging && (
                      <div className="absolute inset-0 bg-blue-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg pointer-events-none">
                          <UploadIcon className="w-16 h-16 text-blue-300 mb-4" />
                          <p className="text-xl font-bold text-white">Drop image or video to analyze</p>
                      </div>
                  )}
                  <input type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" ref={fileInputRef} disabled={isUiDisabled}/>
                   {mediaPreview ? (
                    <div className="relative inline-block">
                      <img src={mediaPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                      {mediaType === 'video' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg pointer-events-none">
                          <PlayIcon className="w-12 h-12 text-white/80" />
                        </div>
                      )}
                    </div>
                   ) : (
                    <p className="text-gray-400">Click or drag & drop to upload an image or video</p>
                   )}
                </div>
              </div>
              <div>
                <label htmlFor="analysisPrompt" className="block text-sm font-medium text-gray-300 mb-1">Analysis Prompt</label>
                <textarea
                  id="analysisPrompt"
                  value={analysisPrompt}
                  onChange={(e) => setAnalysisPrompt(e.target.value)}
                  placeholder="e.g., What is unusual about this?"
                  className="w-full h-24 bg-gray-700 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  disabled={isUiDisabled}
                />
              </div>
            </>
          )}
          <button onClick={handleSubmit} disabled={isUiDisabled || (mode === 'generate' && !prompt) || (mode === 'analyze' && !mediaFile)} className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex justify-center items-center text-lg">
            {isLoading ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : (mode === 'generate' ? 'Generate Image' : 'Analyze')}
          </button>
        </div>

        {/* Right Column: Result */}
        <div className="w-full h-full min-h-[400px] bg-gray-900/50 rounded-lg flex flex-col items-center justify-center p-4 border border-gray-700">
          {isLoading ? (
            <div className="text-center text-gray-400 space-y-4">
              <SpinnerIcon className="w-12 h-12 animate-spin mx-auto text-blue-500"/>
              <p className="font-semibold">{mode === 'generate' ? 'The genie is painting...' : 'Analyzing...'}</p>
            </div>
          ) : result ? (
             mode === 'generate' && result.startsWith('data:image') ? (
              <div className="w-full text-center">
                <img src={result} alt="Generated" className="rounded-lg w-full mb-4 shadow-lg"/>
                <a href={result} download={`${prompt.slice(0, 20).trim().replace(/\s/g, '_') || 'generated-image'}.png`} className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                  <DownloadIcon className="w-5 h-5"/>
                  Download
                </a>
              </div>
             ) : (
                <div className="prose prose-invert prose-p:text-gray-200 prose-li:text-gray-200 max-w-none w-full h-full overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {result}
                    </ReactMarkdown>
                </div>
             )
          ) : (
            <div className="text-center text-gray-500 space-y-4">
               { mode === 'generate' ? (
                   <>
                    <ImagePlaceholderIcon className="w-16 h-16 mx-auto"/>
                    <p>Your generated image will appear here.</p>
                   </>
               ) : (
                   <>
                    {mediaPreview ? (
                        <>
                         <SpinnerIcon className="w-16 h-16 mx-auto"/>
                         <p>Ready to analyze. Hit the button!</p>
                        </>
                    ) : (
                        <>
                          <UploadIcon className="w-16 h-16 mx-auto"/>
                          <p>Upload media to get started.</p>
                        </>
                    )}
                   </>
               )}
            </div>
          )}
        </div>
      </div>
      
      {hasHistory && (
        <div className="mt-12 pt-8 border-t border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">{historyTitle}</h3>
                <button onClick={handleClear} className="text-gray-400 hover:text-white transition-colors flex items-center space-x-2 text-sm">
                    <TrashIcon className="w-4 h-4" />
                    <span>Clear History</span>
                </button>
            </div>
            
            {mode === 'generate' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {history.map((item) => (
                        <div key={item.id} className="group relative bg-gray-800 rounded-lg overflow-hidden shadow-lg aspect-square cursor-pointer" onClick={() => handleReusePrompt(item.prompt)}>
                            <img src={item.imageUrl} alt={item.prompt} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                               <p className="text-white text-xs [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden">{item.prompt}</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {analysisHistory.map((item) => (
                        <div key={item.id} className="group relative bg-gray-800 rounded-lg overflow-hidden shadow-lg aspect-square cursor-pointer" onClick={() => handleLoadAnalysis(item)}>
                            <img src={item.imageThumbnail} alt={item.prompt} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            {item.mediaType === 'video' && (
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                                    <PlayIcon className="w-8 h-8 text-white/70" />
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                               <p className="text-white text-xs [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden">{item.prompt}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ImageGenieView;
