import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from './ChatInterface';
import { Settings, Activity, Sun, Moon, ArrowLeft, RefreshCw } from 'lucide-react';
import { checkStatus } from '../services/handyService';

export default function HandyTimeApp({ isDarkMode, toggleTheme, settings, openSettings }) {
  const navigate = useNavigate();
  const [deviceStatus, setDeviceStatus] = useState('Disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);

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

  const handleReconnect = async () => {
    if (!settings.handyKey || isReconnecting) return;
    setIsReconnecting(true);
    setDeviceStatus('Connecting');
    const connected = await checkStatus(settings.handyKey);
    setDeviceStatus(connected ? 'Connected' : 'Disconnected');
    setIsReconnecting(false);
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
            {settings.handyKey && (
              <button
                onClick={handleReconnect}
                disabled={isReconnecting}
                title="Re-check connection"
                className={`p-1.5 rounded-full transition-colors border border-gray-200 dark:border-gray-700 ${
                  isReconnecting
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <RefreshCw size={13} className={`text-gray-500 dark:text-gray-400 ${isReconnecting ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          <div className="flex space-x-2 border-l pl-4 border-gray-200 dark:border-gray-700">
            <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              {isDarkMode ? <Sun size={20} className="text-gray-300" /> : <Moon size={20} className="text-gray-600" />}
            </button>
            <button onClick={openSettings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <Settings size={20} className="text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-hidden relative"><ChatInterface settings={settings} /></main>
    </div>
  );
}
