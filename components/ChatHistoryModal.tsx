import React, { useState, useMemo } from 'react';
import { SavedConversation } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { EditIcon } from './icons/EditIcon';
import { TrashIcon } from './icons/TrashIcon';
import { SaveIcon } from './icons/SaveIcon';
import { XIcon } from './icons/XIcon';

interface ChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: SavedConversation[];
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  currentChatIsEmpty: boolean;
}

interface ActionModalProps {
  title: string;
  initialValue?: string;
  inputLabel: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const ActionModal: React.FC<ActionModalProps> = ({ title, initialValue = '', inputLabel, confirmLabel, onConfirm, onCancel }) => {
    const [value, setValue] = useState(initialValue);
  
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim()) {
        onConfirm(value.trim());
      }
    };
  
    return (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-sm border border-gray-700" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
          <form onSubmit={handleSubmit}>
            <label htmlFor="convoName" className="sr-only">{inputLabel}</label>
            <input
              id="convoName"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={inputLabel}
              className="w-full bg-gray-700 text-gray-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 rounded-md hover:bg-gray-500">Cancel</button>
              <button type="submit" disabled={!value.trim()} className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-500">{confirmLabel}</button>
            </div>
          </form>
        </div>
      </div>
    );
};

const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
  isOpen, onClose, conversations, onSave, onLoad, onRename, onDelete, currentChatIsEmpty
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState<SavedConversation | null>(null);

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    return conversations.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [conversations, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-semibold">Chat History</h2>
          <div className="relative w-1/2">
            <input
              type="text"
              placeholder="Search history..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-700 rounded-full pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700">
             <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="p-4 overflow-y-auto flex-grow">
          {filteredConversations.length > 0 ? (
            <ul className="space-y-2">
              {filteredConversations.map(convo => (
                <li key={convo.id} className="group bg-gray-900/50 hover:bg-gray-700/50 rounded-lg p-3 flex justify-between items-center transition-colors">
                  <div>
                    <p className="font-semibold text-gray-200">{convo.name}</p>
                    <p className="text-xs text-gray-500">{new Date(convo.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onLoad(convo.id)}
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => setRenamingConversation(convo)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full"
                      title="Rename"
                    >
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                          if(window.confirm(`Are you sure you want to delete "${convo.name}"?`)) {
                              onDelete(convo.id)
                          }
                      }}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded-full"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-gray-500 py-12">
              <p>{searchTerm ? 'No conversations match your search.' : 'No saved conversations yet.'}</p>
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={currentChatIsEmpty}
            className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex justify-center items-center space-x-2"
          >
            <SaveIcon className="w-5 h-5" />
            <span>Save Current Chat</span>
          </button>
        </footer>
      </div>
      
      {showSaveModal && (
        <ActionModal
          title="Save Conversation"
          inputLabel="Enter a name for this chat..."
          confirmLabel="Save"
          onConfirm={(name) => {
            onSave(name);
            setShowSaveModal(false);
          }}
          onCancel={() => setShowSaveModal(false)}
        />
      )}
      
      {renamingConversation && (
        <ActionModal
          title="Rename Conversation"
          initialValue={renamingConversation.name}
          inputLabel="Enter a new name..."
          confirmLabel="Rename"
          onConfirm={(newName) => {
            onRename(renamingConversation.id, newName);
            setRenamingConversation(null);
          }}
          onCancel={() => setRenamingConversation(null)}
        />
      )}

    </div>
  );
};

export default ChatHistoryModal;