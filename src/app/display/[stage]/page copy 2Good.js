'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function StageDisplayPage() {
  const params = useParams();
  const stage = params.stage;
  const [templateExists, setTemplateExists] = useState(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Check if we're in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      setIsElectron(true);
      
      // Check if template exists
      window.electronAPI.template.checkTemplate(stage)
        .then((exists) => {
          setTemplateExists(exists);
          if (exists) {
            // Instead of manipulating the document, redirect to the template server
            const templateUrl = `http://localhost:3001/templates/${stage}/index.html`;
            window.location.replace(templateUrl);
          }
        })
        .catch((error) => {
          console.error('Error checking template:', error);
          setTemplateExists(false);
        });
    } else {
      // In browser mode, redirect to template URL
      const serverHost = window.location.hostname;
      const templateUrl = `http://${serverHost}:3001/templates/${stage}/index.html`;
      window.location.replace(templateUrl);
    }
  }, [stage]);

  if (templateExists === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-2xl">Loading template...</div>
      </div>
    );
  }

  if (!templateExists) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center flex-col">
        <div className="text-4xl font-bold mb-4">Stage Not Found</div>
        <div className="text-xl text-gray-400">
          Template "{stage}" does not exist
        </div>
        <div className="text-sm text-gray-500 mt-4 text-center max-w-md">
          Create a folder named "{stage}" in the templates directory with index.html, styles.css, and script.js files.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-2xl">Redirecting to template...</div>
    </div>
  );
}