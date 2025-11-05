import React, { useMemo } from 'react';
import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from 'diff-match-patch';

interface ScriptDiffModalProps {
  currentScript: string;
  historicalScript: string;
  onClose: () => void;
  onRevert: () => void;
  timestamp: number;
}

const ScriptDiffModal: React.FC<ScriptDiffModalProps> = ({ currentScript, historicalScript, onClose, onRevert, timestamp }) => {
  const dmp = useMemo(() => new diff_match_patch(), []);

  const diff = useMemo(() => {
    const d = dmp.diff_main(historicalScript, currentScript);
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [dmp, historicalScript, currentScript]);

  const renderDiff = () => {
    return diff.map(([op, text], index) => {
      switch (op) {
        case DIFF_INSERT:
          return <span key={index} className="bg-green-900/60">{text}</span>;
        case DIFF_DELETE:
          return <span key={index} className="bg-red-900/60 line-through">{text}</span>;
        case DIFF_EQUAL:
          return <span key={index}>{text}</span>;
        default:
          return null;
      }
    });
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold">Compare Script Versions</h2>
            <p className="text-sm text-gray-400">Comparing current script with version from {new Date(timestamp).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>
        
        <div className="p-4 overflow-y-auto flex-grow">
          <pre className="whitespace-pre-wrap font-sans text-gray-200">
            {renderDiff()}
          </pre>
        </div>
        
        <footer className="p-4 border-t border-gray-700 flex justify-end items-center space-x-4 flex-shrink-0">
            <div className="flex items-center space-x-4 text-sm mr-auto">
                <div className="flex items-center"><span className="w-4 h-4 bg-green-900/60 mr-2 rounded"></span> Added</div>
                <div className="flex items-center"><span className="w-4 h-4 bg-red-900/60 mr-2 rounded"></span> Removed</div>
            </div>
            <button onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500">Close</button>
            <button onClick={onRevert} className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700">Revert to this version</button>
        </footer>
      </div>
    </div>
  );
};

export default ScriptDiffModal;