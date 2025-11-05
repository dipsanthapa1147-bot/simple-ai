
import React, { useState, useEffect } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { transcribeAudio } from '../services/geminiService';
import { MicIcon } from './icons/MicIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { ApiKeyError } from '../services/errors';

const TranscribeView: React.FC = () => {
  const { isRecording, audioBlob, startRecording, stopRecording } = useRecorder();
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (audioBlob) {
      handleTranscription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  const handleTranscription = async () => {
    if (!audioBlob) return;
    setIsLoading(true);
    setTranscription('');
    try {
      // Create a File object from the Blob to send to the service
      const audioFile = new File([audioBlob], "recording.webm", { type: audioBlob.type });
      const result = await transcribeAudio(audioFile);
      setTranscription(result);
    } catch (error) {
      console.error("Transcription error:", error);
      setTranscription("Sorry, an error occurred during transcription.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      setTranscription('');
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center text-center space-y-6">
      <h2 className="text-2xl font-semibold">Audio Transcription</h2>
      <p className="text-gray-400 max-w-md">
        Click the button to start recording. Speak clearly, and click again to stop. Your audio will be transcribed by Gemini.
      </p>
      
      <button
        onClick={toggleRecording}
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300
          ${isRecording ? 'bg-red-600 shadow-lg scale-110 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'}
        `}
      >
        <MicIcon className="w-10 h-10 text-white" />
      </button>
      <p className="text-lg font-medium">{isRecording ? 'Recording...' : 'Click to start recording'}</p>

      {(isLoading || transcription) && (
        <div className="w-full max-w-2xl mt-6 p-4 bg-gray-900 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-left">Transcription Result</h3>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <SpinnerIcon className="w-8 h-8 animate-spin" />
              <p className="ml-4">Transcribing audio...</p>
            </div>
          ) : (
            <p className="text-left whitespace-pre-wrap">{transcription}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TranscribeView;
