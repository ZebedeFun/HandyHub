// Settings Configuration Component
import React, { useState } from 'react';

export default function SettingsModal({ settings, onSave, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    onSave(localSettings);
  };

  const fileInputRef = React.useRef(null);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localSettings, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "handytime-config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        setLocalSettings(prev => ({ ...prev, ...imported }));
        alert("Settings imported! Review them and click Save Settings to apply.");
      } catch (err) {
        alert("Failed to parse settings file.");
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-transparent dark:border-gray-700 transition-colors">
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Configuration</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-3xl leading-none transition-colors">&times;</button>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Handy Connection Key</label>
              <input type="text" name="handyKey" value={localSettings.handyKey} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="e.g. 1234abcd..." />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">LLM API Key (Nano-GPT / OpenRouter)</label>
              <input type="password" name="llmApiKey" value={localSettings.llmApiKey} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">LLM URL Endpoint</label>
              <input type="text" name="llmUrl" value={localSettings.llmUrl || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="https://openrouter.ai/api/v1/chat/completions" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">LLM Model</label>
              <input type="text" name="llmModel" value={localSettings.llmModel || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="e.g. mistralai/mistral-7b-instruct:free" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">LLM Temperature</label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{localSettings.llmTemperature || 0.7}</span>
              </div>
              <input type="range" name="llmTemperature" min="0" max="2" step="0.1" value={localSettings.llmTemperature || 0.7} onChange={handleChange} className="w-full accent-pink-500" />
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>Predictable</span>
                <span>Creative</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Scene Delay (seconds)</label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{localSettings.sceneDelay || 2.5}s</span>
              </div>
              <input type="range" name="sceneDelay" min="0" max="10" step="0.5" value={localSettings.sceneDelay || 2.5} onChange={handleChange} className="w-full accent-pink-500" />
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>Instant</span>
                <span>Wait 10s</span>
              </div>
            </div>
            <div className="border-t border-b dark:border-gray-700 py-4 my-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Text-to-Speech (TTS) Settings</h3>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">TTS Provider</label>
                <select name="ttsProvider" value={localSettings.ttsProvider || 'Google'} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition">
                  <option value="Google">Google API</option>
                  <option value="Kokoro">Local Kokoro</option>
                </select>
              </div>
              
              {(localSettings.ttsProvider === 'Google' || !localSettings.ttsProvider) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Google API Key</label>
                    <input type="password" name="googleApiKey" value={localSettings.googleApiKey || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="AIzaSy..." />
                  </div>
                  <div className="flex space-x-4">
                    <div className="w-1/2">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Google Voice API</label>
                      <select name="googleTtsType" value={localSettings.googleTtsType || 'Neural2'} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition">
                        <option value="Standard">Standard</option>
                        <option value="Wavenet">WaveNet</option>
                        <option value="Neural2">Neural2</option>
                        <option value="Journey">Journey</option>
                      </select>
                    </div>
                    <div className="w-1/2">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Voice Identifier</label>
                      <select name="googleVoice" value={localSettings.googleVoice || 'F'} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition">
                        <option value="A">Voice A (Male)</option>
                        <option value="B">Voice B (Male)</option>
                        <option value="C">Voice C (Female)</option>
                        <option value="D">Voice D (Male)</option>
                        <option value="E">Voice E (Female)</option>
                        <option value="F">Voice F (Female)</option>
                        <option value="G">Voice G (Female)</option>
                        <option value="H">Voice H (Female)</option>
                        <option value="I">Voice I (Male)</option>
                        <option value="J">Voice J (Male)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {localSettings.ttsProvider === 'Kokoro' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Kokoro URL Endpoint</label>
                    <input type="text" name="kokoroUrl" value={localSettings.kokoroUrl || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="http://localhost:8880/v1/audio/speech" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Kokoro Voice</label>
                    <input type="text" name="kokoroVoice" value={localSettings.kokoroVoice || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="e.g. af_bella" />
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Character Name</label>
              <input type="text" name="characterName" value={localSettings.characterName || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="e.g. Samantha" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Character Description</label>
              <textarea name="characterDescription" value={localSettings.characterDescription || ''} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 h-24 bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="Describe personality, traits, and behavior..." />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">System Prompt Base</label>
              <textarea name="systemPrompt" value={localSettings.systemPrompt} onChange={handleChange} className="w-full border dark:border-gray-600 rounded-lg p-3 h-40 font-mono text-sm bg-gray-50 dark:bg-gray-700 dark:text-white focus:bg-white dark:focus:bg-gray-600 focus:ring-2 focus:ring-pink-500 outline-none transition" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[CHARACTER]</code> and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">[NAME]</code> to inject the description and name dynamically during chats.</p>
            </div>
            <div className="pt-6 flex justify-between items-center border-t dark:border-gray-700">
              <div className="flex space-x-3">
                <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportFile} />
                <button type="button" onClick={handleImportClick} className="px-4 py-2 border dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition">Import</button>
                <button type="button" onClick={handleExport} className="px-4 py-2 border dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition">Export</button>
              </div>
              <div className="flex space-x-3">
                <button type="button" onClick={onClose} className="px-5 py-2.5 border dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 font-medium transition shadow-md shadow-pink-500/30">Save Settings</button>
              </div>
            </div>
          </form>
        </div></div></div>
  );
}