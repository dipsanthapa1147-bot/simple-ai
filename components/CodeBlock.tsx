
import React, { useState } from 'react';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';

export const CodeBlock: React.FC<any> = ({ node, inline, className, children, ...props }) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');

    const handleCopy = () => {
        navigator.clipboard.writeText(codeString).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return !inline && match ? (
        <div className="my-4 bg-gray-900 rounded-lg overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2 bg-gray-800">
                <span className="text-gray-400 text-sm">{match[1]}</span>
                <button onClick={handleCopy} className="text-gray-400 hover:text-white flex items-center space-x-1 text-sm">
                    {isCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                    <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <pre className="p-4 overflow-x-auto text-sm">
                <code className={className} {...props}>
                    {children}
                </code>
            </pre>
        </div>
    ) : (
        <code className="bg-gray-700 text-red-300 rounded-sm px-1 py-0.5 font-mono text-sm" {...props}>
            {children}
        </code>
    );
};
