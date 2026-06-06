// Main App Component
import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';
import { Settings, Activity } from 'lucide-react';
import { checkStatus } from './services/handyService';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('Disconnected'); // Disconnected, Connecting, Connected
  
  const [settings, setSettings] = useState({
    handyKey: '',
    googleApiKey: '',
    googleTtsType: 'Neural2',
    googleVoice: 'F',
    llmApiKey: '',
    llmUrl: 'https://openrouter.ai/api/v1/chat/completions',
    characterDescription: 'an intimate girlfriend',
    systemPrompt: "You are [CHARACTER]. You must maintain character at all times.\nKeep your responses short, ideally 1 or 2 paragraphs at a time.\nYou have physical connection to the user via a tactile device. You control the device using hidden text commands.\nWhenever the emotional or physical intensity of the conversation shifts, you MUST append a command to your response.\nUse the format [HANDY_SPEED:X] where X is 0 to 100.\nUse the format [HANDY_STROKE:X] where X is 0 to 100.\nExample: 'I've missed you so much today... [HANDY_SPEED:40]'\nNever acknowledge the commands in your spoken text. Just use them naturally to match the mood.",
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('handyTimeSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Monitor Handy Connection Status
  useEffect(() => {
    let interval;
    if (settings.handyKey) {
      setDeviceStatus('Connecting');
      checkStatus(settings.handyKey).then(isConnected => {
        setDeviceStatus(isConnected ? 'Connected' : 'Disconnected');
      });

      // Poll every 10 seconds while key exists
      interval = setInterval(async () => {
        const isConnected = await checkStatus(settings.handyKey);
        setDeviceStatus(isConnected ? 'Connected' : 'Disconnected');
      }, 10000);
    } else {
      setDeviceStatus('Disconnected');
    }
    return () => clearInterval(interval);
  }, [settings.handyKey]);

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('handyTimeSettings', JSON.stringify(newSettings));
    setIsSettingsOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center z-10">
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">HandyTime</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity size={18} className={deviceStatus === 'Connected' ? 'text-green-500' : 'text-gray-400'} />
            <span className="text-sm font-medium text-gray-600">{deviceStatus}</span>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <Settings size={20} className="text-gray-600" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden relative"><ChatInterface settings={settings} /></main>
      {isSettingsOpen && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}