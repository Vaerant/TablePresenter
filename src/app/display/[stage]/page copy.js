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
            // Load the template
            loadTemplate();
          }
        })
        .catch((error) => {
          console.error('Error checking template:', error);
          setTemplateExists(false);
        });
    } else {
      // In browser mode, redirect to template URL
      const templateUrl = `/templates/${stage}/index.html`;
      window.location.href = templateUrl;
    }
  }, [stage]);

  const loadTemplate = async () => {
    try {
      const templateContent = await window.electronAPI.template.getTemplate(stage);
      
      // Create a new document with the template content
      const newWindow = window.open('', '_self');
      newWindow.document.open();
      newWindow.document.write(templateContent);
      newWindow.document.close();
    } catch (error) {
      console.error('Error loading template:', error);
      setTemplateExists(false);
    }
  };

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

  return null; // Template will be loaded by loadTemplate()
}
