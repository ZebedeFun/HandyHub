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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Configuration</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Handy Connection Key</label>
              <input type="text" name="handyKey" value={localSettings.handyKey} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="e.g. 1234abcd..." />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">LLM API Key (Nano-GPT / OpenRouter)</label>
              <input type="password" name="llmApiKey" value={localSettings.llmApiKey} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">LLM URL Endpoint</label>
              <input type="text" name="llmUrl" value={localSettings.llmUrl || ''} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="https://openrouter.ai/api/v1/chat/completions" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Google API Key</label>
              <input type="password" name="googleApiKey" value={localSettings.googleApiKey || ''} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" placeholder="AIzaSy..." />
            </div>
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Google Voice API</label>
                <select name="googleTtsType" value={localSettings.googleTtsType || 'Neural2'} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition">
                  <option value="Standard">Standard</option>
                  <option value="Wavenet">WaveNet</option>
                  <option value="Neural2">Neural2</option>
                  <option value="Journey">Journey</option>
                </select>
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Voice Identifier</label>
                <select name="googleVoice" value={localSettings.googleVoice || 'F'} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition">
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
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Character Description</label>
              <input type="text" name="characterDescription" value={localSettings.characterDescription} onChange={handleChange} className="w-full border rounded-lg p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">System Prompt Base</label>
              <textarea name="systemPrompt" value={localSettings.systemPrompt} onChange={handleChange} className="w-full border rounded-lg p-3 h-40 font-mono text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-pink-500 outline-none transition" />
              <p className="text-xs text-gray-500 mt-2">Use <code className="bg-gray-100 px-1 rounded">[CHARACTER]</code> to inject the description dynamically during chats.</p>
            </div>
            <div className="pt-6 flex justify-end space-x-3 border-t">
              <button type="button" onClick={onClose} className="px-5 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 font-medium transition shadow-md shadow-pink-500/30">Save Settings</button>
            </div>
          </form>
        </div></div></div>
  );
}