
import React, { useState, useEffect } from 'react';
import { Tab, TabId } from './types';
import ChatView from './components/ChatView';
import ImageGenieView from './components/ImageGenieView';
import VideoFactoryView from './components/VideoFactoryView';
import LiveTalkView from './components/LiveTalkView';
import TranscribeView from './components/TranscribeView';
import ScriptGenieView from './components/ScriptGenieView';
import { TabsNavigation } from './components/TabsNavigation';
import PromptLabView from './components/PromptLabView';

const TABS: Tab[] = [
  { id: TabId.CHAT, label: 'Chat' },
  { id: TabId.PROMPT_LAB, label: 'Prompt Lab' },
  { id: TabId.IMAGE, label: 'Image Genie' },
  { id: TabId.VIDEO, label: 'Video Factory' },
  { id: TabId.LIVE, label: 'Live Talk' },
  { id: TabId.TRANSCRIBE, label: 'Transcribe' },
  { id: TabId.SCRIPT, label: 'Script Genie' },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>(TabId.CHAT);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('script')) {
      setActiveTab(TabId.SCRIPT);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case TabId.CHAT:
        return <ChatView />;
      case TabId.PROMPT_LAB:
        return <PromptLabView />;
      case TabId.IMAGE:
        return <ImageGenieView />;
      case TabId.VIDEO:
        return <VideoFactoryView />;
      case TabId.LIVE:
        return <LiveTalkView />;
      case TabId.TRANSCRIBE:
        return <TranscribeView />;
      case TabId.SCRIPT:
        return <ScriptGenieView />;
      default:
        return null;
    }
  };

  return (
      <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 font-sans">
        <header className="w-full max-w-5xl text-center mb-6">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
            Gemini AI Multi-Modal Suite
          </h1>
          <p className="text-gray-400">
            Explore the full spectrum of Gemini's capabilities in one application.
          </p>
        </header>
        <main className="w-full max-w-5xl flex-grow">
          <TabsNavigation tabs={TABS} activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="mt-6 bg-gray-800/50 rounded-xl shadow-2xl p-4 md:p-8 border border-gray-700">
            {renderContent()}
          </div>
        </main>
        <footer className="w-full max-w-5xl text-center mt-8 text-gray-500 text-sm">
          <p>Powered by Google Gemini API</p>
        </footer>
      </div>
  );
};

export default App;
