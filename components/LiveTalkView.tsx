
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { encode, decode, decodeAudioData, blobToBase64 } from '../utils/helpers';
import { TranscriptionEntry } from '../types';
import { MicIcon } from './icons/MicIcon';
import { GeminiIcon } from './icons/GeminiIcon';
import { UserIcon } from './icons/UserIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { CameraIcon } from './icons/CameraIcon';
import { CameraOffIcon } from './icons/CameraOffIcon';

const LiveTalkView: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const playbackRateRef = useRef(playbackRate);

  // Use `any` for the session promise as the `LiveSession` type is not exported from the SDK.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  const nextStartTimeRef = useRef(0);
  const transcriptionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions]);

  const stopFrameStreaming = useCallback(() => {
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopFrameStreaming();
    scriptProcessorRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    videoStreamRef.current?.getTracks().forEach(track => track.stop());
    
    if(inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
     if(outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close();
    }
    
    for (const source of audioSourcesRef.current.values()) {
      try { source.stop(); } catch(e) { /* ignore */ }
    }
    audioSourcesRef.current.clear();

    scriptProcessorRef.current = null;
    mediaStreamRef.current = null;
    videoStreamRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
  }, [stopFrameStreaming]);

  const stopConversation = useCallback(() => {
    sessionPromiseRef.current?.then((session: any) => session.close());
    sessionPromiseRef.current = null;
    cleanup();
    setIsConnected(false);
    setIsConnecting(false);
  }, [cleanup]);

  const startFrameStreaming = useCallback(() => {
    stopFrameStreaming();

    const FPS = 5;
    const JPEG_QUALITY = 0.7;

    frameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !canvasRef.current || !sessionPromiseRef.current || videoRef.current.readyState < 2) {
            return;
        }

        const videoEl = videoRef.current;
        const canvasEl = canvasRef.current;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);

        canvasEl.toBlob(
            async (blob) => {
                if (blob && sessionPromiseRef.current) {
                    try {
                        const base64Data = await blobToBase64(blob);
                        sessionPromiseRef.current.then((session: any) => {
                            if (session) {
                                session.sendRealtimeInput({
                                    media: { data: base64Data, mimeType: 'image/jpeg' }
                                });
                            }
                        });
                    } catch (error) {
                        console.error("Error processing video frame:", error);
                    }
                }
            },
            'image/jpeg',
            JPEG_QUALITY
        );
    }, 1000 / FPS);
  }, [stopFrameStreaming]);

  useEffect(() => {
    if (isConnected && isCameraOn) {
      startFrameStreaming();
    } else {
      stopFrameStreaming();
    }
  }, [isConnected, isCameraOn, startFrameStreaming, stopFrameStreaming]);


  const startConversation = async () => {
    setIsConnecting(true);
    setTranscriptions([]);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser does not support the MediaDevices API.");
      setIsConnecting(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
          onopen: () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromiseRef.current?.then((session: any) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            setIsConnecting(false);
            setIsConnected(true);
          },
          onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.inputTranscription?.text) {
                  currentInputTranscription.current += message.serverContent.inputTranscription.text;
              }
              if (message.serverContent?.outputTranscription?.text) {
                  currentOutputTranscription.current += message.serverContent.outputTranscription.text;
              }
              if (message.serverContent?.turnComplete) {
                const userInput = currentInputTranscription.current.trim();
                const modelOutput = currentOutputTranscription.current.trim();
                
                if (userInput || modelOutput) {
                   setTranscriptions(prev => [...prev, 
                    ...(userInput ? [{ speaker: 'user' as const, text: userInput }] : []),
                    ...(modelOutput ? [{ speaker: 'model' as const, text: modelOutput }] : [])
                  ]);
                }

                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }
              
              const audioDataB64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
              if (audioDataB64) {
                  const outputCtx = outputAudioContextRef.current!;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                  const audioBuffer = await decodeAudioData(decode(audioDataB64), outputCtx, 24000, 1);
                  const source = outputCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.playbackRate.value = playbackRateRef.current;
                  source.connect(outputCtx.destination);
                  source.addEventListener('ended', () => { audioSourcesRef.current.delete(source); });
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration / playbackRateRef.current;
                  audioSourcesRef.current.add(source);
              }
          },
          onerror: (e: ErrorEvent) => {
            console.error("Live session error:", e);
            stopConversation();
          },
          onclose: () => {
            stopConversation();
          },
        },
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
      setIsConnecting(false);
    }
  };
  
  useEffect(() => {
    return () => {
        if(isConnected || isConnecting) {
            stopConversation();
        } else {
            cleanup();
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = async () => {
    if (isCameraOn && videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        videoStreamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsCameraOn(false);
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoStreamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsCameraOn(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access the camera. Please check permissions and ensure no other app is using it.");
        }
    }
  };
  
  const isUiDisabled = isConnecting;

  const getActionText = () => {
    if (isConnecting) return 'Please wait...';
    if (isConnected) return 'Click the orb to stop.';
    return 'Click the orb to start talking.';
  };

  const statusInfo = isConnecting 
    ? { text: 'Connecting', color: 'bg-yellow-500', pulse: true }
    : isConnected
    ? { text: 'Connected', color: 'bg-green-500', pulse: true }
    : { text: 'Disconnected', color: 'bg-red-500', pulse: false };


  return (
    <div className="flex flex-col h-[70vh] w-full">
       <div className="relative w-full max-w-3xl mx-auto mb-4 bg-gray-900/50 rounded-lg min-h-[180px] flex justify-center items-center overflow-hidden flex-shrink-0">
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-auto max-h-48 rounded-lg transition-opacity duration-300 ${isCameraOn ? 'opacity-100' : 'opacity-0'}`}
            />
            {!isCameraOn && (
                <div className="absolute inset-0 flex flex-col justify-center items-center text-center text-gray-500">
                    <CameraOffIcon className="w-12 h-12 mx-auto mb-2" />
                    <p>Camera is off</p>
                </div>
            )}
            <button
                onClick={toggleCamera}
                disabled={isConnecting}
                className={`absolute top-2 right-2 p-2 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed z-10 ${isCameraOn ? 'bg-blue-600/80 text-white' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600/80'}`}
                aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
                {isCameraOn ? <CameraIcon className="w-5 h-5" /> : <CameraOffIcon className="w-5 h-5" />}
            </button>
        </div>

      <div className="flex-grow w-full max-w-3xl mx-auto overflow-y-auto pr-4 space-y-4 mb-4">
        {transcriptions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MicIcon className="w-16 h-16 mb-4"/>
                <p className="text-lg">Start a conversation to see the transcript here.</p>
            </div>
        )}
        {transcriptions.map((entry, index) => (
          <div key={index} className={`flex items-start gap-3 ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            {entry.speaker === 'model' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-purple-600">
                <GeminiIcon className="w-5 h-5 text-white" />
              </div>
            )}
            <div className={`p-3 rounded-lg max-w-md ${entry.speaker === 'user' ? 'bg-blue-900/50' : 'bg-gray-700/50'}`}>
              <p className="text-gray-200">{entry.text}</p>
            </div>
             {entry.speaker === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-600">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={transcriptionsEndRef} />
      </div>

      <div className="flex-shrink-0 flex flex-col items-center justify-center py-4 space-y-3">
        <button
          onClick={isConnected ? stopConversation : startConversation}
          disabled={isUiDisabled}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
            ${isConnecting ? 'bg-yellow-600/20' : ''}
            ${isConnected ? 'bg-red-600/20' : 'bg-green-600/20'}
            ${isUiDisabled ? 'bg-gray-600/20 cursor-not-allowed' : 'hover:scale-105'}
          `}
          aria-label={isConnecting ? 'Connecting' : isConnected ? 'Stop Conversation' : 'Start Conversation'}
        >
          {isConnecting && <SpinnerIcon className="absolute w-28 h-28 text-yellow-500 animate-spin" />}
          {isConnected && <div className="absolute w-24 h-24 bg-red-500 rounded-full animate-pulse"></div>}

          <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors
            ${isConnecting ? 'bg-yellow-600' : ''}
            ${isConnected ? 'bg-red-600' : ''}
            ${!isConnected && !isConnecting ? 'bg-green-600' : ''}
            ${isUiDisabled && !isConnecting ? 'bg-gray-600' : ''}
          `}>
             <MicIcon className="w-10 h-10 text-white" />
          </div>
        </button>
        <div className="text-center h-10 flex flex-col justify-center">
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-300">
                <span className={`w-2.5 h-2.5 rounded-full transition-colors ${statusInfo.color} ${statusInfo.pulse ? 'animate-pulse' : ''}`}></span>
                <span>{statusInfo.text}</span>
            </div>
            <p className="text-gray-400 text-xs mt-1">{getActionText()}</p>
        </div>
        <div className="flex items-center space-x-2 pt-2">
            <span className="text-xs font-medium text-gray-500">Playback Speed:</span>
            {[1.0, 1.5, 2.0].map((rate) => (
                <button
                    key={rate}
                    onClick={() => setPlaybackRateState(rate)}
                    disabled={!isConnected}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500
                        ${
                        playbackRate === rate
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                >
                    {rate.toFixed(1)}x
                </button>
            ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
};

export default LiveTalkView;