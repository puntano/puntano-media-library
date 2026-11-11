import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Search,
  Check,
  Edit2,
  ArrowLeft,
  Loader2,
  Merge,
  Sparkles,
  StopCircle,
  User,
  Heart,
  Star,
} from 'lucide-react';
import { tauriApi } from '../../services/tauriApi';
import { Person, MediaItem, FaceScanProgress } from '../../types/media';
import { MediaThumbnail } from '../common/MediaThumbnail';
import { useLibraryStore } from '../../stores/libraryStore';

export const PeopleView: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scanProgress, setScanProgress] = useState<FaceScanProgress | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Person detail view state
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [personMedia, setPersonMedia] = useState<MediaItem[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState<boolean>(false);

  // Inline editing state
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Merge mode state
  const [isMergeMode, setIsMergeMode] = useState<boolean>(false);
  const [selectedForMerge, setSelectedForMerge] = useState<number[]>([]);
  const [isMerging, setIsMerging] = useState<boolean>(false);

  const { openLightbox, syncRevision, incrementSyncRevision } = useLibraryStore();

  const loadPeople = async () => {
    setIsLoading(true);
    try {
      const data = await tauriApi.getPeople();
      setPeople(data);
    } catch (err) {
      console.error('Failed to load people:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load & sync
  useEffect(() => {
    loadPeople();
  }, [syncRevision]);

  // Check face scan progress on mount & subscribe to live progress events
  useEffect(() => {
    let isDisposed = false;

    tauriApi.getFaceScanProgress().then((p) => {
      if (!isDisposed) {
        setScanProgress(p);
        setIsScanning(p.is_running);
      }
    }).catch(console.error);

    const unlistenPromise = tauriApi.onFaceScanProgress((progress) => {
      if (isDisposed) return;
      setScanProgress(progress);
      setIsScanning(progress.is_running);
      if (!progress.is_running) {
        loadPeople();
      }
    });

    return () => {
      isDisposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // When a person is selected, load their media
  useEffect(() => {
    if (!selectedPerson) {
      setPersonMedia([]);
      return;
    }

    let isDisposed = false;
    setIsLoadingMedia(true);

    tauriApi.getPersonMedia(selectedPerson.id)
      .then((items) => {
        if (!isDisposed) {
          setPersonMedia(items);
        }
      })
      .catch((err) => console.error('Failed to load person media:', err))
      .finally(() => {
        if (!isDisposed) {
          setIsLoadingMedia(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [selectedPerson]);

  const handleStartScan = async () => {
    try {
      setIsScanning(true);
      await tauriApi.startFaceScan();
    } catch (err) {
      console.error('Failed to start face scan:', err);
      setIsScanning(false);
    }
  };

  const handleStopScan = async () => {
    try {
      await tauriApi.stopFaceScan();
      setIsScanning(false);
    } catch (err) {
      console.error('Failed to stop face scan:', err);
    }
  };

  const handleStartRename = (e: React.MouseEvent, person: Person) => {
    e.stopPropagation();
    setEditingPersonId(person.id);
    setEditingName(person.name || '');
  };

  const handleSaveRename = async (personId: number) => {
    const trimmed = editingName.trim();
    const finalName = trimmed ? trimmed : null;

    try {
      await tauriApi.updatePersonName(personId, finalName);
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, name: finalName } : p))
      );
      if (selectedPerson && selectedPerson.id === personId) {
        setSelectedPerson((prev) => (prev ? { ...prev, name: finalName } : null));
      }
      setEditingPersonId(null);
      incrementSyncRevision();
    } catch (err) {
      console.error('Failed to rename person:', err);
    }
  };

  const toggleMergeSelect = (personId: number) => {
    setSelectedForMerge((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  };

  const handleExecuteMerge = async () => {
    if (selectedForMerge.length < 2) return;

    // Pick target: prefer person with a name, or first
    const target = people.find((p) => selectedForMerge.includes(p.id) && p.name)
      || people.find((p) => p.id === selectedForMerge[0]);

    if (!target) return;

    const sources = selectedForMerge.filter((id) => id !== target.id);
    const targetName = target.name || `Person #${target.id}`;

    if (
      !confirm(
        `Merge ${selectedForMerge.length} people into "${targetName}"?\n\nAll photos will be grouped together under this person.`
      )
    ) {
      return;
    }

    setIsMerging(true);
    try {
      await tauriApi.mergePeople(target.id, sources);
      setSelectedForMerge([]);
      setIsMergeMode(false);
      incrementSyncRevision();
      await loadPeople();
    } catch (err) {
      console.error('Failed to merge people:', err);
    } finally {
      setIsMerging(false);
    }
  };

  const filteredPeople = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return people;
    return people.filter((p) => {
      const name = p.name ? p.name.toLowerCase() : 'unnamed';
      return name.includes(q);
    });
  }, [people, searchQuery]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '28px 32px',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {/* If viewing a single person's photo collection */}
      {selectedPerson ? (
        <div>
          {/* Back Navigation Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <button
              onClick={() => setSelectedPerson(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              <ArrowLeft size={16} />
              Back to People
            </button>
          </div>

          {/* Person Hero Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              padding: '24px',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              marginBottom: '28px',
            }}
          >
            {/* Avatar Circle */}
            <div
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-primary)',
                border: '3px solid var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}
            >
              {selectedPerson.cover_face_id ? (
                <img
                  src={`puntano-thumb://localhost/face/${selectedPerson.cover_face_id}`}
                  alt={selectedPerson.name || 'Face'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={48} color="var(--text-secondary)" />
              )}
            </div>

            {/* Info & Name edit */}
            <div style={{ flex: 1 }}>
              {editingPersonId === selectedPerson.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(selectedPerson.id);
                      if (e.key === 'Escape') setEditingPersonId(null);
                    }}
                    autoFocus
                    placeholder="Enter person's name..."
                    style={{
                      padding: '8px 14px',
                      fontSize: '22px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      border: '1px solid var(--accent-primary)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleSaveRename(selectedPerson.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Check size={18} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>
                    {selectedPerson.name || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Add a name</span>}
                  </h1>
                  <button
                    onClick={(e) => handleStartRename(e, selectedPerson)}
                    title="Edit Name"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '6px',
                    }}
                  >
                    <Edit2 size={18} />
                  </button>
                </div>
              )}

              <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                {personMedia.length} {personMedia.length === 1 ? 'photo' : 'photos'} recognized
              </p>
            </div>
          </div>

          {/* Photos Grid */}
          {isLoadingMedia ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '240px' }}>
              <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
            </div>
          ) : personMedia.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-secondary)',
              }}
            >
              No photos found for this person.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              {personMedia.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => openLightbox(personMedia, idx)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <MediaThumbnail
                    filePath={item.file_path}
                    fileHash={item.file_hash}
                    mediaType={item.media_type}
                    orientation={item.orientation}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  {/* Badges for Favorite & Rating */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      display: 'flex',
                      gap: '4px',
                    }}
                  >
                    {item.is_favorite && (
                      <span
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.85)',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Heart size={12} color="#ffffff" fill="#ffffff" />
                      </span>
                    )}
                    {item.rating > 0 && (
                      <span
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.85)',
                          color: '#ffffff',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          fontSize: '10px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <Star size={10} color="#ffffff" fill="#ffffff" />
                        {item.rating}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Main People Grid View */
        <div>
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={28} color="var(--accent-primary)" />
                <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800 }}>People & Faces</h1>
              </div>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                100% Offline facial recognition. Find all photos of your loved ones instantly.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isMergeMode ? (
                <>
                  <button
                    disabled={selectedForMerge.length < 2 || isMerging}
                    onClick={handleExecuteMerge}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 16px',
                      borderRadius: '8px',
                      backgroundColor: selectedForMerge.length >= 2 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                      color: selectedForMerge.length >= 2 ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      cursor: selectedForMerge.length >= 2 ? 'pointer' : 'not-allowed',
                      fontWeight: 600,
                      fontSize: '13px',
                    }}
                  >
                    {isMerging ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />}
                    Merge Selected ({selectedForMerge.length})
                  </button>
                  <button
                    onClick={() => {
                      setIsMergeMode(false);
                      setSelectedForMerge([]);
                    }}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {people.length > 1 && (
                    <button
                      onClick={() => setIsMergeMode(true)}
                      title="Select multiple clusters to merge into one person"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '9px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                      }}
                    >
                      <Merge size={15} />
                      Merge
                    </button>
                  )}

                  {isScanning ? (
                    <button
                      onClick={handleStopScan}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '9px 16px',
                        borderRadius: '8px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                      }}
                    >
                      <StopCircle size={16} />
                      Pause Scan
                    </button>
                  ) : (
                    <button
                      onClick={handleStartScan}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '9px 18px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--accent-primary)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      }}
                    >
                      <Sparkles size={16} />
                      Scan Faces
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Active Face Scanning Banner */}
          {scanProgress && scanProgress.is_running && (
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px' }}>
                  <Loader2 size={16} className="animate-spin" color="var(--accent-primary)" />
                  Scanning Library for Faces...
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {scanProgress.total_scanned.toLocaleString()} / {scanProgress.total_scannable.toLocaleString()} photos
                  ({Math.round((scanProgress.total_scanned / Math.max(1, scanProgress.total_scannable)) * 100)}%)
                </div>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  height: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (scanProgress.total_scanned / Math.max(1, scanProgress.total_scannable)) * 100)}%`,
                    backgroundColor: 'var(--accent-primary)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>🎯 {scanProgress.faces_found.toLocaleString()} faces detected</span>
                <span>👤 {scanProgress.people_identified.toLocaleString()} people recognized</span>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div style={{ position: 'relative', maxWidth: '360px', marginBottom: '24px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter people by name..."
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* People Grid */}
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
              <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
            </div>
          ) : filteredPeople.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '70px 20px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '16px',
                border: '1px dashed var(--border-color)',
              }}
            >
              <Users size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px auto', opacity: 0.6 }} />
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>
                {searchQuery ? 'No matching people found' : 'No faces recognized yet'}
              </h3>
              <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                {searchQuery
                  ? 'Try searching with a different name.'
                  : 'Click "Scan Faces" to analyze your photos offline using AI and group them by person.'}
              </p>
              {!searchQuery && !isScanning && (
                <button
                  onClick={handleStartScan}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}
                >
                  <Sparkles size={16} />
                  Scan Faces Now
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '24px 16px',
              }}
            >
              {filteredPeople.map((person) => {
                const isSelected = selectedForMerge.includes(person.id);
                return (
                  <div
                    key={person.id}
                    onClick={() => {
                      if (isMergeMode) {
                        toggleMergeSelect(person.id);
                      } else {
                        setSelectedPerson(person);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      userSelect: 'none',
                    }}
                  >
                    {/* Avatar Circle */}
                    <div
                      style={{
                        width: '110px',
                        height: '110px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        backgroundColor: 'var(--bg-secondary)',
                        border: isSelected
                          ? '3px solid var(--accent-primary)'
                          : '2px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: isSelected
                          ? '0 0 0 3px rgba(59, 130, 246, 0.4)'
                          : '0 3px 10px rgba(0,0,0,0.15)',
                        transition: 'transform 0.2s ease, border-color 0.2s ease',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = 'scale(1.0)';
                      }}
                    >
                      {person.cover_face_id ? (
                        <img
                          src={`puntano-thumb://localhost/face/${person.cover_face_id}`}
                          alt={person.name || 'Face'}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <User size={40} color="var(--text-secondary)" />
                      )}

                      {/* Merge selection checkbox indicator */}
                      {isMergeMode && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: isSelected ? 'var(--accent-primary)' : 'rgba(0,0,0,0.6)',
                            border: '2px solid #ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelected && <Check size={14} color="#ffffff" />}
                        </div>
                      )}
                    </div>

                    {/* Person Name & Count */}
                    <div
                      style={{
                        marginTop: '10px',
                        textAlign: 'center',
                        width: '100%',
                        padding: '0 4px',
                      }}
                    >
                      {editingPersonId === person.id ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(person.id);
                              if (e.key === 'Escape') setEditingPersonId(null);
                            }}
                            autoFocus
                            style={{
                              width: '100%',
                              padding: '3px 6px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              border: '1px solid var(--accent-primary)',
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              textAlign: 'center',
                            }}
                          />
                          <button
                            onClick={() => handleSaveRename(person.id)}
                            style={{
                              background: 'var(--accent-primary)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <Check size={12} />
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: person.name ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontStyle: person.name ? 'normal' : 'italic',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '100px',
                            }}
                          >
                            {person.name || 'Add name'}
                          </span>
                          {!isMergeMode && (
                            <button
                              onClick={(e) => handleStartRename(e, person)}
                              title="Edit name"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: '2px',
                                opacity: 0.7,
                              }}
                            >
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      )}

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
