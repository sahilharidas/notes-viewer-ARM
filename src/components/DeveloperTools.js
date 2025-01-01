// Create a new file: components/DeveloperTools.js
import React, { useState } from 'react';
import { Settings } from 'lucide-react';

const DeveloperTools = ({ onReset }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Only show in development
  if (process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-gray-800 text-gray-200 rounded-full opacity-30 hover:opacity-100 transition-opacity"
        title="Developer Tools"
      >
        <Settings size={20} />
      </button>
      
      {isOpen && (
        <div className="absolute bottom-12 right-0 bg-white p-4 rounded-lg shadow-lg border border-gray-200 min-w-[200px]">
          <h3 className="font-medium text-gray-900 mb-3">Developer Tools</h3>
          <button
            onClick={() => {
              if (window.confirm('Are you sure? This will reset all progress.')) {
                onReset();
                setIsOpen(false);
              }
            }}
            className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Reset All Progress
          </button>
        </div>
      )}
    </div>
  );
};

export default DeveloperTools;