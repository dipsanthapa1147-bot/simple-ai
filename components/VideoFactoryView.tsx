
import React, { useState, useEffect, useCallback } from 'react';
import { generateVideo, checkVideoOperation } from '../services/geminiService';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { GenerateVideosOperation } from '@google/genai';
import { generateVideoThumbnail } from '../utils/helpers';
import { PlayIcon } from './icons/PlayIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { TrashIcon } from './icons/TrashIcon';
import { FilmIcon } from './icons/FilmIcon';

interface VideoHistoryEntry {
  id: number;
  prompt: string;
  videoUrl: string;
  thumbnailUrl: string;
}

const AspectRatioButton: React.FC<{ value: '16:9' | '9:16', label: string, current: string, setter: (val: '16:9' | '9:16') => void, disabled: boolean }> = 
({ value, label, current, setter, disabled }) => (
    <button onClick={() => setter(value)} disabled={disabled} className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${current === value ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
      {label}
    </button>
);

const ResolutionButton: React.FC<{ value: '720p' | '1080p', label: string, current: string, setter: (val: '720p' | '1080p') => void, disabled: boolean }> = 
({ value, label, current, setter, disabled }) => (
    <button onClick={() => setter(value)} disabled={disabled} className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${current === value ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
      {label}
    </button>
);


const VideoFactoryView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<'valid' | 'invalid' | 'unknown'>('unknown');
  const [hasCheckedInitialKey, setHasCheckedInitialKey] = useState(false);
  const [videoHistory, setVideoHistory] = useState<VideoHistoryEntry[]>([]);


  const checkApiKey = useCallback(async () => {
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      try {
        const keySelected = await window.aistudio.hasSelectedApiKey();
        if (!keySelected) {
          setApiKeyStatus('invalid');
        } else if (apiKeyStatus !== 'invalid') {
          setApiKeyStatus('valid');
        }
      } catch (e) {
        console.error("Error checking for API key", e);
        setApiKeyStatus('invalid');
      }
    }
    setHasCheckedInitialKey(true);
  }, [apiKeyStatus]);


  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      videoHistory.forEach(item => URL.revokeObjectURL(item.videoUrl));
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoHistory, videoUrl]);


  const handleSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setApiKeyStatus('valid');
      setError(null);
    }
  };

  const pollOperation = useCallback(async (operation: GenerateVideosOperation) => {
    let currentOperation = operation;

    while (!currentOperation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      try {
        currentOperation = await checkVideoOperation(currentOperation);
        
        if (currentOperation.metadata?.progressPercent) {
          const percent = currentOperation.metadata.progressPercent as number;
          setProgress(percent);
          setLoadingMessage(`Rendering video... ${percent}% complete.`);
        } else if (currentOperation.metadata?.state === 'PROCESSING') {
          setLoadingMessage("The model is processing your video request...");
        } else {
          setLoadingMessage("Waiting for generation to start...");
        }
      } catch (err) {
        console.error("Polling failed", err);
        throw err;
      }
    }

    setProgress(100);
    setLoadingMessage("Finalizing video and preparing for download...");
    return currentOperation;
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setVideoUrl(null);
    setError(null);
    setProgress(0);
    setLoadingMessage("Initializing video generation...");

    try {
      let operation = await generateVideo(prompt, aspectRatio, resolution);
      const finalOperation = await pollOperation(operation);

      if(finalOperation) {
          const downloadLink = finalOperation.response?.generatedVideos?.[0]?.video?.uri;
          if (downloadLink) {
            const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
             if (!response.ok) {
              throw new Error(`Failed to fetch video data. Status: ${response.status}`);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);

            try {
              const thumbnailUrl = await generateVideoThumbnail(blob);
              const newHistoryEntry: VideoHistoryEntry = {
                id: Date.now(),
                prompt,
                videoUrl: url,
                thumbnailUrl,
              };
              setVideoHistory(prev => [newHistoryEntry, ...prev].slice(0, 5));
            } catch (thumbError) {
              console.error("Could not generate video thumbnail:", thumbError);
            }

          } else {
            setError("Video generation finished, but the final video was not available. This can be a temporary issue. Please try again.");
          }
      }
    } catch (err: any) {
        const errorMessage = err.message?.toLowerCase() || '';

        if (errorMessage.includes('api key') || errorMessage.includes('billing') || errorMessage.includes('permission denied') || errorMessage.includes('was not found')) {
            setApiKeyStatus('invalid');
            setError("API Key error. Please re-select a key for a project with billing enabled. It may take a moment for the new key to be active.");
        } else if (errorMessage.includes('prompt was blocked') || errorMessage.includes('safety policy')) {
            setError("Your prompt may have violated the safety policy. Please modify your prompt and try again.");
        } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
            setError("You have exceeded your usage quota. Please check your project settings or try again later.");
        } else {
            console.error("Video generation error:", err);
            setError("An unexpected error occurred during video generation. Please try again.");
        }
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewHistoryItem = (url: string) => {
    setVideoUrl(url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownloadHistoryItem = (url: string, promptText: string) => {
    const link = document.createElement('a');
    link.href = url;
    const fileName = promptText.trim().toLowerCase().replace(/\s+/g, '-').substring(0, 30) || 'generated-video';
    link.download = `${fileName}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearHistory = () => {
    videoHistory.forEach(item => URL.revokeObjectURL(item.videoUrl));
    setVideoHistory([]);
  };

  if (!hasCheckedInitialKey) {
      return (
        <div className="flex justify-center items-center h-48">
          <SpinnerIcon className="w-8 h-8 animate-spin" />
        </div>
      );
  }

  if (apiKeyStatus === 'invalid') {
    return (
        <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">API Key Required for Video Generation</h2>
            <p className="text-gray-400 mb-6">Veo video generation requires you to select a project with billing enabled.</p>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mb-6 block">Learn about billing</a>
            <button onClick={handleSelectKey} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Select API Key</button>
            {error && <p className="text-red-400 mt-4">{error}</p>}
        </div>
    );
  }

  const isUiDisabled = isLoading || apiKeyStatus !== 'valid';

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left Column: Controls */}
        <div className="space-y-6">
          <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">Your Prompt</label>
              <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A cinematic shot of a goldfish majestically swimming through a field of underwater flowers."
                  className="w-full h-32 bg-gray-700 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                  disabled={isUiDisabled}
              />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
              <div className="flex flex-wrap gap-2">
                <AspectRatioButton value="16:9" label="16:9 (Landscape)" current={aspectRatio} setter={setAspectRatio} disabled={isUiDisabled} />
                <AspectRatioButton value="9:16" label="9:16 (Portrait)" current={aspectRatio} setter={setAspectRatio} disabled={isUiDisabled} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Resolution</label>
              <div className="flex flex-wrap gap-2">
                <ResolutionButton value="720p" label="720p" current={resolution} setter={setResolution} disabled={isUiDisabled} />
                <ResolutionButton value="1080p" label="1080p" current={resolution} setter={setResolution} disabled={isUiDisabled} />
              </div>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={isUiDisabled || !prompt.trim()} className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex justify-center items-center text-lg">
              {isLoading ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : 'Generate Video'}
          </button>
        </div>

        {/* Right Column: Result */}
        <div className="w-full h-full min-h-[400px] bg-gray-900/50 rounded-lg flex flex-col items-center justify-center p-4 border border-gray-700">
          {isLoading ? (
            <div className="text-center p-4 w-full space-y-3">
                <SpinnerIcon className="w-12 h-12 animate-spin mx-auto text-blue-500"/>
                <p className="text-lg font-medium text-gray-300 mt-3">{loadingMessage}</p>
                <div className="w-full bg-gray-700 rounded-full h-2.5 mt-4">
                    <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${progress}%`, transition: 'width 0.5s ease-in-out' }}
                    ></div>
                </div>
                <p className="text-sm text-gray-500 mt-2">Video generation can take several minutes. Please be patient.</p>
            </div>
          ) : error ? (
            <p className="text-red-400 text-center">{error}</p>
          ) : videoUrl ? (
            <video src={videoUrl} controls autoPlay loop className="w-full rounded-lg shadow-lg"></video>
          ) : (
             <div className="text-center text-gray-500 space-y-4">
                <FilmIcon className="w-16 h-16 mx-auto"/>
                <p>Your generated video will appear here.</p>
            </div>
          )}
        </div>
      </div>
      
      {videoHistory.length > 0 && (
        <div className="mt-12 pt-8 border-t border-gray-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Generation History</h3>
                <button 
                    onClick={handleClearHistory}
                    className="text-gray-400 hover:text-white transition-colors flex items-center space-x-2 text-sm"
                >
                    <TrashIcon className="w-4 h-4" />
                    <span>Clear History</span>
                </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {videoHistory.map((item) => (
                    <div key={item.id} className="group relative bg-gray-800 rounded-lg overflow-hidden shadow-lg aspect-video">
                        <img src={item.thumbnailUrl} alt={item.prompt} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                           <p className="text-white text-xs [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden">{item.prompt}</p>
                           <div className="flex justify-center space-x-2">
                                <button onClick={() => handleViewHistoryItem(item.videoUrl)} className="bg-white/20 text-white p-2 rounded-full hover:bg-white/40" title="View Video">
                                    <PlayIcon className="w-5 h-5" />
                                </button>
                                <button onClick={() => handleDownloadHistoryItem(item.videoUrl, item.prompt)} className="bg-white/20 text-white p-2 rounded-full hover:bg-white/40" title="Download Video">
                                    <DownloadIcon className="w-5 h-5" />
                                </button>
                           </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};

export default VideoFactoryView;
