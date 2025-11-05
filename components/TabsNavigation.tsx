
import React from 'react';
import { Tab, TabId } from '../types';

interface TabsNavigationProps {
  tabs: Tab[];
  activeTab: TabId;
  setActiveTab: (tabId: TabId) => void;
}

export const TabsNavigation: React.FC<TabsNavigationProps> = ({ tabs, activeTab, setActiveTab }) => {
  return (
    <nav className="flex justify-center border-b border-gray-700 mb-6">
      <ul className="flex flex-wrap -mb-px">
        {tabs.map((tab) => (
          <li className="mr-2" key={tab.id}>
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`inline-block p-4 border-b-2 rounded-t-lg transition-colors duration-300
                ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};
