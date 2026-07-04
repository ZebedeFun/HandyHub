import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from './ChatInterface';
import SettingsModal from './SettingsModal';
import { Settings, Activity, Sun, Moon, ArrowLeft } from 'lucide-react';
import { checkStatus } from '../services/handyService';

export default function HandyTimeApp({ isDarkMode, toggleTheme }) {
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('Disconnected'); // Disconnected, Connecting, Connected
  
  const [settings, setSettings] = useState(() => {
    const defaultSettings = {
      handyKey: '',
      ttsProvider: 'Google',
      googleApiKey: '',
      googleTtsType: 'Neural2',
      googleVoice: 'F',
      kokoroUrl: 'http://localhost:8880/v1/audio/speech',
      kokoroVoice: 'af_bella',
      llmApiKey: '',
      llmUrl: 'https://openrouter.ai/api/v1/chat/completions',
      llmModel: 'mistralai/mistral-7b-instruct:free',
      llmTemperature: 0.7,
      characterName: 'Samantha',
      characterDescription: 'an intimate girlfriend',
      sceneDelay: 2.5,
      systemPrompt: "You are [CHARACTER], and your name is [NAME]. You must maintain character at all times.\nKeep your responses short, ideally 1 or 2 paragraphs at a time.\nOnly use spoken dialogue. Never use asterisks for actions or roleplay (e.g., do not use *seductively whispers* or *gently runs fingers through your hair*). Instead, explain and describe what you are doing naturally within your spoken words.\nYou have physical connection to the user via a tactile device. You control the device using hidden text commands.\nWhenever the emotional or physical intensity of the conversation shifts, you MUST append a command to your response.\nCRITICAL PACING RULE: Start extremely slow and gentle (e.g., speed 10-20) for the first few messages. Build up the intensity slowly and non-linearly over a long period of time. Do NOT jump to high speeds (80-100) right away. Drag it out, tease the buildup, and let the intensity rise and fall naturally.\nUse the format [HANDY_SPEED:X] where X is 0 to 100.\nUse the format [HANDY_STROKE:X] where X is 0 to 100.\nExample: '[HANDY_SPEED:20][HANDY_STROKE:80] I've missed you so much today...'\nNever acknowledge the commands in your spoken text. Just use them naturally to match the mood.",
    };
    try {
      const saved = localStorage.getItem('handyTimeSettings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  });

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (Object.keys(data).length > 0) {
          setSettings(prev => {
            const newSet = { ...prev, ...data };
            localStorage.setItem('handyTimeSettings', JSON.stringify(newSet));
            return newSet;
          });
        } else {
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: localStorage.getItem('handyTimeSettings') || JSON.stringify(settings)
          }).catch(() => {});
        }
      })
      .catch(err => console.error('Error loading settings from server:', err));
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

  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    setIsSettingsOpen(false);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      localStorage.setItem('handyTimeSettings', JSON.stringify(newSettings));
    } catch (err) {
      console.error('Error saving settings to server:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-none border-b border-transparent dark:border-gray-700 p-4 flex justify-between items-center z-10 transition-colors">
        <div className="flex items-center">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors mr-2">
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">AI Partner</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity size={18} className={deviceStatus === 'Connected' ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'} />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{deviceStatus}</span>
          </div>
          <div className="flex space-x-2 border-l pl-4 border-gray-200 dark:border-gray-700">
            <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              {isDarkMode ? <Sun size={20} className="text-gray-300" /> : <Moon size={20} className="text-gray-600" />}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <Settings size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden relative"><ChatInterface settings={settings} /></main>
      {isSettingsOpen && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}
