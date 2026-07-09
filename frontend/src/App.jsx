import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import HandyTimeApp from './components/HandyTimeApp';
import HandyScripter from './components/scripter/HandyScripter';
import HandyRemote from './components/remote/HandyRemote';
import AutoSync from './components/autosync/AutoSync';
import SettingsModal from './components/SettingsModal';
import { Settings } from 'lucide-react';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
      ttsChunking: 'sentence',
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

  // Load Dark Mode Preference
  useEffect(() => {
    if (localStorage.getItem('handyTimeTheme') === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('handyTimeTheme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('handyTimeTheme', 'light');
      }
      return next;
    });
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home isDarkMode={isDarkMode} toggleTheme={toggleTheme} openSettings={() => setIsSettingsOpen(true)} />} />
        <Route path="/chat" element={<HandyTimeApp isDarkMode={isDarkMode} toggleTheme={toggleTheme} settings={settings} openSettings={() => setIsSettingsOpen(true)} />} />
        <Route path="/scripter" element={<HandyScripter isDarkMode={isDarkMode} toggleTheme={toggleTheme} settings={settings} openSettings={() => setIsSettingsOpen(true)} />} />
        <Route path="/remote" element={<HandyRemote isDarkMode={isDarkMode} toggleTheme={toggleTheme} settings={settings} openSettings={() => setIsSettingsOpen(true)} />} />
        <Route path="/autosync" element={<AutoSync isDarkMode={isDarkMode} toggleTheme={toggleTheme} settings={settings} openSettings={() => setIsSettingsOpen(true)} />} />
      </Routes>
      {isSettingsOpen && <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setIsSettingsOpen(false)} />}
    </Router>
  );
}