
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateText } from '../services/geminiService';
import { ApiKeyError } from '../services/errors';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { BeakerIcon } from './icons/BeakerIcon';
import { CodeBlock } from './CodeBlock';
import { XIcon } from './icons/XIcon';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';

const ParameterSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  description: string;
}> = ({ label, value, onChange, min, max, step, disabled, description }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <span className="text-sm font-mono bg-gray-700 px-2 py-0.5 rounded">{label === 'Top-K' ? value : value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      disabled={disabled}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
    />
    <p className="text-xs text-gray-400">{description}</p>
  </div>
);


const PromptLabView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.95);
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResult('');
    setError(null);

    try {
      const response = await generateText(prompt, temperature, topK, topP);
      setResult(response);
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Prompt Lab Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
  };
  
  const isUiDisabled = isLoading;

  return (
    <div className="grid lg:grid-cols-10 gap-8">
        {/* Left Column: Controls */}
        <div className="lg:col-span-4 space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-semibold flex items-center gap-2"><BeakerIcon className="w-6 h-6"/> Prompt Lab</h2>
                <p className="text-gray-400">
                    A playground for experimenting with prompts and model parameters to get the perfect response.
                </p>
            </div>
            
            <div className="space-y-2">
                <label htmlFor="prompt-lab-input" className="text-lg font-semibold">Your Prompt</label>
                 <div className="relative">
                    <textarea
                        id="prompt-lab-input"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter your prompt here..."
                        className="w-full h-48 bg-gray-700 text-gray-200 rounded-lg p-3 pr-10 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 resize-y"
                        disabled={isUiDisabled}
                    />
                     {prompt && (
                        <button onClick={() => setPrompt('')} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white" title="Clear prompt">
                            <XIcon className="w-4 h-4" />
                        </button>
                    )}
                    <span className="absolute bottom-2 right-2 text-xs text-gray-400 pointer-events-none">{prompt.length}</span>
                </div>
            </div>

            <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold">Configuration</h3>
                <ParameterSlider
                    label="Temperature"
                    description="Controls randomness. Lower values are more deterministic."
                    value={temperature}
                    onChange={setTemperature}
                    min={0} max={1} step={0.01}
                    disabled={isUiDisabled}
                />
                 <ParameterSlider
                    label="Top-K"
                    description="Limits the model's predictions to the K most likely tokens."
                    value={topK}
                    onChange={setTopK}
                    min={1} max={100} step={1}
                    disabled={isUiDisabled}
                />
                 <ParameterSlider
                    label="Top-P"
                    description="The model considers tokens with a cumulative probability of P."
                    value={topP}
                    onChange={setTopP}
                    min={0} max={1} step={0.01}
                    disabled={isUiDisabled}
                />
            </div>

            
             <button
                onClick={handleSubmit}
                disabled={isUiDisabled || !prompt.trim()}
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex justify-center items-center text-lg"
             >
                {isLoading ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : 'Generate'}
            </button>
        </div>

        {/* Right Column: Result */}
        <div className="lg:col-span-6">
            <div className="w-full h-full min-h-[60vh] lg:h-full bg-gray-900/50 rounded-lg flex flex-col border border-gray-700">
                <div className="flex justify-between items-center p-3 border-b border-gray-700 flex-shrink-0">
                    <h3 className="text-xl font-semibold">Response</h3>
                    {result && !isLoading && (
                        <button onClick={handleCopy} className="text-gray-400 hover:text-white flex items-center space-x-1.5 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors">
                            {isCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                            <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    )}
                </div>

                <div className="flex-grow p-4 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center text-gray-400">
                            <div className="text-center space-y-4">
                                <SpinnerIcon className="w-12 h-12 animate-spin mx-auto text-blue-500"/>
                                <p className="font-semibold">Gemini is thinking...</p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex h-full items-center justify-center text-red-400">
                            <p>{error}</p>
                        </div>
                    ) : result ? (
                        <div className="prose prose-invert prose-p:text-gray-200 prose-li:text-gray-200 max-w-none w-full pr-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
                                {result}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center text-gray-500">
                            <div className="text-center space-y-4 border-2 border-dashed border-gray-700 rounded-xl p-8">
                                <BeakerIcon className="w-16 h-16 mx-auto"/>
                                <p>The model's response will appear here.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default PromptLabView;
