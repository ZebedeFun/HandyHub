import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import HandyTimeApp from './components/HandyTimeApp';
import HandyScripter from './components/scripter/HandyScripter';
import HandyRemote from './components/remote/HandyRemote';
import AutoSync from './components/autosync/AutoSync';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

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
        <Route path="/" element={<Home isDarkMode={isDarkMode} toggleTheme={toggleTheme} />} />
        <Route path="/chat" element={<HandyTimeApp isDarkMode={isDarkMode} toggleTheme={toggleTheme} />} />
        <Route path="/scripter" element={<HandyScripter isDarkMode={isDarkMode} toggleTheme={toggleTheme} />} />
        <Route path="/remote" element={<HandyRemote isDarkMode={isDarkMode} toggleTheme={toggleTheme} />} />
        <Route path="/autosync" element={<AutoSync isDarkMode={isDarkMode} toggleTheme={toggleTheme} />} />
      </Routes>
    </Router>
  );
}