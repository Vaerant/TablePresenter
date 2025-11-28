'use client';

import { useState, useEffect } from 'react';
import ScreensPanel from './components/ScreensPanel';
import SpacesCanvas from './components/SpacesCanvas';
import LayersPanel from './components/LayersPanel';
import SettingsPanel from './components/SettingsPanel';
import ScreenModal from './components/modals/ScreenModal';
import SpaceModal from './components/modals/SpaceModal';

export default function ScreensPage() {
  const [screens, setScreens] = useState([]);
  const [selectedScreen, setSelectedScreen] = useState(null);
  const [screenSpaces, setScreenSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [showScreenModal, setShowScreenModal] = useState(false);
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingScreen, setEditingScreen] = useState(null);
  const [editingSpace, setEditingSpace] = useState(null);

  useEffect(() => {
    loadScreens();
  }, []);

  useEffect(() => {
    if (selectedScreen) {
      loadScreenSpaces(selectedScreen.id);
    }
  }, [selectedScreen]);

  const loadScreens = async () => {
    try {
      const screensData = await window.electronAPI.system.getAllScreens();
      setScreens(screensData);
      if (screensData.length > 0 && !selectedScreen) {
        setSelectedScreen(screensData[0]);
      }
    } catch (error) {
      console.error('Error loading screens:', error);
    }
  };

  const loadScreenSpaces = async (screenId) => {
    try {
      const spacesData = await window.electronAPI.system.getScreenSpaces(screenId);
      setScreenSpaces(spacesData);
    } catch (error) {
      console.error('Error loading screen spaces:', error);
    }
  };

  // Screen handlers
  const handleAddScreen = () => {
    setEditingScreen(null);
    setShowScreenModal(true);
  };

  const handleEditScreen = (screen) => {
    setEditingScreen(screen);
    setShowScreenModal(true);
  };

  const handleScreenSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const screenData = {
      screen_name: formData.get('screen_name'),
      resolution: formData.get('resolution'),
      aspect_ratio: formData.get('aspect_ratio')
    };

    try {
      if (editingScreen) {
        await window.electronAPI.system.updateScreen(editingScreen.id, screenData);
      } else {
        const newScreen = await window.electronAPI.system.createScreen(screenData);
        setSelectedScreen(newScreen);
      }
      setShowScreenModal(false);
      setEditingScreen(null);
      loadScreens();
    } catch (error) {
      console.error('Error saving screen:', error);
    }
  };

  const handleDeleteScreen = async (screenId) => {
    try {
      await window.electronAPI.system.deleteScreen(screenId);
      loadScreens();
      if (selectedScreen?.id === screenId) {
        setSelectedScreen(screens.find(s => s.id !== screenId) || null);
      }
    } catch (error) {
      console.error('Error deleting screen:', error);
    }
  };

  // Space handlers
  const handleAddSpace = () => {
    setEditingSpace(null);
    setShowSpaceModal(true);
  };

  const handleEditSpace = (space) => {
    setEditingSpace(space);
    setShowSpaceModal(true);
  };

  const handleSpaceSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const spaceData = {
      screen_id: selectedScreen.id,
      space_name: formData.get('space_name'),
      height: parseInt(formData.get('height')),
      width: parseInt(formData.get('width')),
      x_position: parseInt(formData.get('x_position')),
      y_position: parseInt(formData.get('y_position')),
      is_active: formData.get('is_active') === 'on' ? 1 : 0
    };

    console.log('Submitting space data:', spaceData);

    try {
      if (editingSpace) {
        await window.electronAPI.system.updateScreenSpace(editingSpace.id, spaceData);
      } else {
        const createdSpace = await window.electronAPI.system.createScreenSpace(spaceData);
        console.log('Space created successfully:', createdSpace);
      }
      setShowSpaceModal(false);
      setEditingSpace(null);
      loadScreenSpaces(selectedScreen.id);
    } catch (error) {
      console.error('Error saving space:', error);
      alert(`Error saving space: ${error.message}`);
    }
  };

  const handleDeleteSpace = async (spaceId) => {
    try {
      await window.electronAPI.system.deleteScreenSpace(spaceId);
      loadScreenSpaces(selectedScreen.id);
    } catch (error) {
      console.error('Error deleting space:', error);
    }
  };

  const handleMoveSpace = async (spaceId, x, y) => {
    try {
      const space = screenSpaces.find(s => s.id === spaceId);
      if (space) {
        // Parse screen resolution properly
        const [screenWidth, screenHeight] = selectedScreen.resolution.split('x').map(Number);
        
        // Ensure coordinates are within screen bounds
        const boundedX = Math.max(0, Math.min(x, screenWidth - space.width));
        const boundedY = Math.max(0, Math.min(y, screenHeight - space.height));
        
        // Update local state immediately for responsive UI
        setScreenSpaces(prevSpaces => 
          prevSpaces.map(s => 
            s.id === spaceId 
              ? { ...s, x_position: boundedX, y_position: boundedY }
              : s
          )
        );

        // Update selected space if it's the one being moved
        if (selectedSpace?.id === spaceId) {
          setSelectedSpace(prev => ({ ...prev, x_position: boundedX, y_position: boundedY }));
        }

        // Update database - only send position data
        await window.electronAPI.system.updateScreenSpace(spaceId, {
          x_position: boundedX,
          y_position: boundedY
        });
      }
    } catch (error) {
      console.error('Error updating space position:', error);
      // Reload spaces to revert to last known good state
      loadScreenSpaces(selectedScreen.id);
    }
  };

  const handleResizeSpace = async (spaceId, dimensions) => {
    try {
      const space = screenSpaces.find(s => s.id === spaceId);
      if (space) {
        // Update local state immediately for responsive UI
        setScreenSpaces(prevSpaces => 
          prevSpaces.map(s => 
            s.id === spaceId 
              ? { ...s, ...dimensions }
              : s
          )
        );

        // Update selected space if it's the one being resized
        if (selectedSpace?.id === spaceId) {
          setSelectedSpace(prev => ({ ...prev, ...dimensions }));
        }

        // Update database - only send dimension data
        await window.electronAPI.system.updateScreenSpace(spaceId, dimensions);
      }
    } catch (error) {
      console.error('Error updating space dimensions:', error);
      // Reload spaces to revert to last known good state
      loadScreenSpaces(selectedScreen.id);
    }
  };

  // Settings handlers
  const handleUpdateSettings = async (spaceId, settings) => {
    try {
      await window.electronAPI.system.updateScreenSpaceSettings(spaceId, settings);
      
      // Reload spaces to get updated data
      await loadScreenSpaces(selectedScreen.id);
      
      // Update selected space with new settings
      const updatedSpaces = await window.electronAPI.system.getScreenSpaces(selectedScreen.id);
      const updatedSpace = updatedSpaces.find(s => s.id === spaceId);
      if (updatedSpace) {
        setSelectedSpace(updatedSpace);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const handleSelectSpace = (space) => {
    setSelectedSpace(space);
  };

  const handleToggleActive = async (spaceId, isActive) => {
    try {
      const space = screenSpaces.find(s => s.id === spaceId);
      if (space) {
        // Update local state immediately
        setScreenSpaces(prevSpaces => 
          prevSpaces.map(s => 
            s.id === spaceId 
              ? { ...s, is_active: isActive ? 1 : 0 }
              : s
          )
        );

        // Update selected space if it's the one being modified
        if (selectedSpace?.id === spaceId) {
          setSelectedSpace(prev => ({ ...prev, is_active: isActive ? 1 : 0 }));
        }

        // Update database
        await window.electronAPI.system.updateScreenSpace(spaceId, {
          ...space,
          is_active: isActive ? 1 : 0
        });
      }
    } catch (error) {
      console.error('Error toggling space active state:', error);
      loadScreenSpaces(selectedScreen.id);
    }
  };

  const handleDuplicateSpace = async (space) => {
    try {
      const duplicateData = {
        screen_id: selectedScreen.id,
        space_name: `${space.space_name} Copy`,
        height: space.height,
        width: space.width,
        x_position: space.x_position + 20, // Offset slightly
        y_position: space.y_position + 20,
        is_active: space.is_active
      };

      const duplicatedSpace = await window.electronAPI.system.createScreenSpace(duplicateData);
      console.log('Space duplicated successfully:', duplicatedSpace);
      
      // Reload spaces to get the new space
      loadScreenSpaces(selectedScreen.id);
    } catch (error) {
      console.error('Error duplicating space:', error);
      alert(`Error duplicating space: ${error.message}`);
    }
  };

  const handleUpdateZIndex = async (spaceId, newZIndex) => {
    try {
      const space = screenSpaces.find(s => s.id === spaceId);
      if (!space) return;
      
      // Calculate bounds
      const minZIndex = 0;
      const maxZIndex = screenSpaces.length - 1;
      
      // Ensure new z-index is within bounds
      const boundedZIndex = Math.max(minZIndex, Math.min(maxZIndex, newZIndex));
      
      if (boundedZIndex === space.z_index) {
        return; // No change needed
      }
      
      // Find the space currently at the target z-index to swap with
      const targetSpace = screenSpaces.find(s => s.z_index === boundedZIndex);
      
      if (targetSpace && targetSpace.id !== space.id) {
        // Swap z-indices
        setScreenSpaces(prevSpaces => 
          prevSpaces.map(s => {
            if (s.id === space.id) {
              return { ...s, z_index: boundedZIndex };
            } else if (s.id === targetSpace.id) {
              return { ...s, z_index: space.z_index };
            }
            return s;
          })
        );

        // Update selected space if it's one of the affected spaces
        if (selectedSpace?.id === space.id) {
          setSelectedSpace(prev => ({ ...prev, z_index: boundedZIndex }));
        } else if (selectedSpace?.id === targetSpace.id) {
          setSelectedSpace(prev => ({ ...prev, z_index: space.z_index }));
        }

        // Update database for both spaces
        await window.electronAPI.system.updateScreenSpace(space.id, {
          z_index: boundedZIndex
        });
        await window.electronAPI.system.updateScreenSpace(targetSpace.id, {
          z_index: space.z_index
        });
      } else {
        // Direct update (shouldn't happen with swapping logic, but safety net)
        setScreenSpaces(prevSpaces => 
          prevSpaces.map(s => 
            s.id === spaceId 
              ? { ...s, z_index: boundedZIndex }
              : s
          )
        );

        if (selectedSpace?.id === spaceId) {
          setSelectedSpace(prev => ({ ...prev, z_index: boundedZIndex }));
        }

        await window.electronAPI.system.updateScreenSpace(spaceId, {
          z_index: boundedZIndex
        });
      }
    } catch (error) {
      console.error('Error updating z-index:', error);
      loadScreenSpaces(selectedScreen.id);
    }
  };

  return (
    <div className="h-full flex bg-neutral-900 text-white">
      <ScreensPanel
        screens={screens}
        selectedScreen={selectedScreen}
        onScreenSelect={setSelectedScreen}
        onAddScreen={handleAddScreen}
        onEditScreen={handleEditScreen}
        onDeleteScreen={handleDeleteScreen}
      />

      <div className="flex-1 flex flex-col">
        <SpacesCanvas
          selectedScreen={selectedScreen}
          screenSpaces={screenSpaces}
          selectedSpace={selectedSpace}
          onSelectSpace={handleSelectSpace}
          onAddSpace={handleAddSpace}
          onEditSpace={handleEditSpace}
          onDeleteSpace={handleDeleteSpace}
          onMoveSpace={handleMoveSpace}
          onResizeSpace={handleResizeSpace}
          onUpdateZIndex={handleUpdateZIndex}
        />

        <SettingsPanel
          selectedSpace={selectedSpace}
          onUpdateSettings={handleUpdateSettings}
        />
      </div>

      <LayersPanel
        screenSpaces={screenSpaces}
        selectedSpace={selectedSpace}
        onSelectSpace={handleSelectSpace}
        onUpdateZIndex={handleUpdateZIndex}
        onToggleActive={handleToggleActive}
        onDeleteSpace={handleDeleteSpace}
        onDuplicateSpace={handleDuplicateSpace}
      />

      {/* Modals */}
      <ScreenModal
        isOpen={showScreenModal}
        editingScreen={editingScreen}
        onClose={() => {
          setShowScreenModal(false);
          setEditingScreen(null);
        }}
        onSubmit={handleScreenSubmit}
      />

      <SpaceModal
        isOpen={showSpaceModal}
        editingSpace={editingSpace}
        onClose={() => {
          setShowSpaceModal(false);
          setEditingSpace(null);
        }}
        onSubmit={handleSpaceSubmit}
      />
    </div>
  );
}