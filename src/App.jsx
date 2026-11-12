import { useState, useEffect } from 'react';
import MapComponent from './MapComponent';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

const fetchWithAuth = async (url, options = {}) => {
  const headers = { ...options.headers, ...getAuthHeaders() };
  return fetch(url, { ...options, headers });
};

function App() {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [formData, setFormData] = useState({ name: '', desc: '', lat: '', lon: '' });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [notification, setNotification] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [tempMarkerPos, setTempMarkerPos] = useState(null);
  const [photos, setPhotos] = useState({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success' && params.get('token')) {
      localStorage.setItem('authToken', params.get('token'));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (autoSaveEnabled && user && points.length > 0) {
      saveToGoogleDrive();
    }
  }, [points, photos, autoSaveEnabled, user]);

  const checkAuth = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/user`);
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        setAutoSaveEnabled(true);
      }
    } catch (error) {
      console.log('Backend non disponible');
    }
  };

  useEffect(() => {
    const initUser = async () => {
      if (user) {
        await loadFromGoogleDrive();
        await checkPermissions();
      } else {
        setCanEdit(false);
      }
    };
    initUser();
  }, [user]);

  const checkPermissions = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/permissions`);
      if (res.ok) {
        const data = await res.json();
        setCanEdit(data.canEdit);
        console.log(`📝 Permissions vérifiées: ${data.canEdit ? 'EDIT' : 'VIEW'}`);
      } else {
        console.error('Erreur permissions:', res.status);
      }
    } catch (error) {
      console.error('Erreur en vérifiant les permissions:', error);
    }
  };

  const loadFromGoogleDrive = async () => {
    if (!user) return;
    setLoading(true);
    setPoints([]);
    setPhotos({});
    setSelectedPoint(null);
    setFormData({ name: '', desc: '', lat: '', lon: '' });
    try {
      const res = await fetchWithAuth(`${API_URL}/api/gpx`);
      if (res.ok) {
        const gpxText = await res.text();
        parseGPX(gpxText);
      } else if (res.status === 404) {
        showNotification('Fichier GPX non trouvé sur Google Drive', 'error');
      } else if (res.status === 403) {
        showNotification('Droits d\'accès insuffisants pour accéder au fichier', 'error');
      } else {
        showNotification('Erreur en chargeant le fichier depuis Google Drive', 'error');
      }
    } catch (error) {
      console.error('Erreur en chargeant le GPX:', error);
      showNotification('Impossible de se connecter au serveur', 'error');
    }
    setLoading(false);
  };

  const parseGPX = (gpxText) => {
    try {
      const parser = new DOMParser();
      const gpxDoc = parser.parseFromString(gpxText, 'text/xml');
      const wpts = gpxDoc.querySelectorAll('wpt');

      console.log('📍 Points trouvés dans le GPX:', wpts.length);

      const importedPoints = [];
      const importedPhotos = {};

      wpts.forEach((wpt, idx) => {
        const lat = parseFloat(wpt.getAttribute('lat'));
        const lon = parseFloat(wpt.getAttribute('lon'));
        const name = wpt.querySelector('name')?.textContent || 'Sans nom';
        const desc = wpt.querySelector('desc')?.textContent || '';

        console.log('  -', name, `(${lat}, ${lon})`);

        importedPoints.push({
          name,
          desc,
          lat,
          lon,
          color: '#384DDC',
        });

        const photosElement = wpt.querySelector('photos');
        if (photosElement) {
          const photoElements = photosElement.querySelectorAll('photo');
          if (photoElements.length > 0) {
            importedPhotos[idx] = Array.from(photoElements).map((el) => ({
              id: el.getAttribute('id'),
              name: el.textContent,
            }));
          }
        }
      });

      console.log('✅ Chargement du Drive:', importedPoints.length, 'points');
      setPoints(importedPoints);
      setPhotos(importedPhotos);
    } catch (error) {
      console.error('Erreur en parsant le GPX:', error);
    }
  };

  const saveToGoogleDrive = async () => {
    if (!user) return;
    try {
      let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Carte des Moulins</name>
  </metadata>
`;

      points.forEach((point, idx) => {
        gpx += `  <wpt lat="${point.lat}" lon="${point.lon}">
    <name>${point.name}</name>
    <desc>${point.desc || ''}</desc>`;

        if (photos[idx] && photos[idx].length > 0) {
          gpx += `
    <photos>`;
          photos[idx].forEach((photo) => {
            gpx += `
      <photo id="${photo.id}">${photo.name}</photo>`;
          });
          gpx += `
    </photos>`;
        }

        gpx += `
  </wpt>
`;
      });

      gpx += '</gpx>';

      const res = await fetchWithAuth(`${API_URL}/api/gpx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpx }),
      });

      if (res.ok) {
        console.log('✅ Sauvegardé sur Google Drive');
      }
    } catch (error) {
      console.error('Erreur en sauvegardant:', error);
    }
  };

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth(`${API_URL}/api/logout`);
      localStorage.removeItem('authToken');
      setUser(null);
      setAutoSaveEnabled(false);
    } catch (error) {
      console.error('Erreur en se déconnectant:', error);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const showConfirmation = (message, onConfirm, onCancel) => {
    setConfirmation({ message, onConfirm, onCancel });
  };

  const handleUploadPhoto = async (e) => {
    if (!canEdit) {
      showNotification('Vous n\'avez que les droits de lecture sur ce fichier', 'error');
      return;
    }

    if (selectedPoint === null) {
      showNotification('Sélectionne un moulin d\'abord', 'error');
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    console.log('📤 Début du téléchargement de:', file.name);
    setUploadingPhoto(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        console.log('📖 Lecture du fichier terminée');
        try {
          const photoData = event.target.result;
          const mouleName = formData.name || 'moulin';

          console.log('⬆️ Téléchargement vers le serveur...');
          const res = await fetchWithAuth(`${API_URL}/api/upload-photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mouleName,
              photoData,
              fileName: file.name,
            }),
          });

          if (res.ok) {
            const photoInfo = await res.json();
            const pointIndex = selectedPoint;

            console.log('✅ Photo uploadée avec succès');
            setPhotos((prev) => ({
              ...prev,
              [pointIndex]: [
                ...(prev[pointIndex] || []),
                {
                  id: photoInfo.id,
                  name: photoInfo.name,
                  webViewLink: photoInfo.webViewLink,
                },
              ],
            }));

            showNotification('✅ Photo téléchargée!');
            e.target.value = '';
          } else {
            const errorData = await res.json();
            console.error('Erreur serveur:', errorData);
            showNotification('Erreur lors du téléchargement de la photo', 'error');
          }
        } finally {
          setUploadingPhoto(false);
          console.log('🏁 Téléchargement terminé');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur en uploadant la photo', 'error');
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = (pointIndex, photoIndex) => {
    if (!canEdit) {
      showNotification('Vous n\'avez que les droits de lecture sur ce fichier', 'error');
      return;
    }

    showConfirmation('Supprimer cette photo?', () => {
      setPhotos((prev) => ({
        ...prev,
        [pointIndex]: prev[pointIndex].filter((_, idx) => idx !== photoIndex),
      }));
      showNotification('🗑️ Photo supprimée');
    });
  };

  const openLightbox = (pointIndex, photoIndex) => {
    setLightbox({ pointIndex, photoIndex });
  };

  const closeLightbox = () => {
    setLightbox(null);
  };

  const goToPreviousPhoto = () => {
    if (!lightbox) return;
    const { pointIndex, photoIndex } = lightbox;
    const maxIndex = photos[pointIndex].length - 1;
    const newIndex = photoIndex === 0 ? maxIndex : photoIndex - 1;
    setLightbox({ pointIndex, photoIndex: newIndex });
  };

  const goToNextPhoto = () => {
    if (!lightbox) return;
    const { pointIndex, photoIndex } = lightbox;
    const maxIndex = photos[pointIndex].length - 1;
    const newIndex = photoIndex === maxIndex ? 0 : photoIndex + 1;
    setLightbox({ pointIndex, photoIndex: newIndex });
  };

  const handleMapClick = (latlng) => {
    setTempMarkerPos({ lat: latlng.lat, lon: latlng.lng });
    setFormData({
      name: '',
      desc: '',
      lat: latlng.lat.toFixed(6),
      lon: latlng.lng.toFixed(6),
    });
    setSelectedPoint(null);
  };

  const handleClearTemp = () => {
    setTempMarkerPos(null);
    setFormData({ name: '', desc: '', lat: '', lon: '' });
  };

  const handleAddPoint = () => {
    if (!canEdit) {
      showNotification('Vous n\'avez que les droits de lecture sur ce fichier', 'error');
      return;
    }

    if (!formData.name || !formData.lat || !formData.lon) {
      showNotification('Remplis le nom et les coordonnées', 'error');
      return;
    }

    const isModifying = selectedPoint !== null;
    const message = isModifying
      ? `Modifier "${formData.name}" ?`
      : `Ajouter "${formData.name}" ?`;

    showConfirmation(message, () => {
      const newPoint = {
        name: formData.name,
        desc: formData.desc,
        lat: parseFloat(formData.lat),
        lon: parseFloat(formData.lon),
      };

      if (isModifying) {
        const updatedPoints = [...points];
        updatedPoints[selectedPoint] = newPoint;
        setPoints(updatedPoints);
        showNotification('✅ Moulin modifié avec succès!');
      } else {
        setPoints([...points, newPoint]);
        showNotification('✅ Moulin ajouté avec succès!');
      }

      setFormData({ name: '', desc: '', lat: '', lon: '' });
      setSelectedPoint(null);
      setTempMarkerPos(null);
    });
  };

  const handleSelectPoint = (idx) => {
    setSelectedPoint(idx);
    setFormData({
      name: points[idx].name,
      desc: points[idx].desc || '',
      lat: points[idx].lat,
      lon: points[idx].lon,
    });
  };

  const handleDeletePoint = () => {
    if (!canEdit) {
      showNotification('Vous n\'avez que les droits de lecture sur ce fichier', 'error');
      return;
    }

    if (selectedPoint !== null) {
      const deletedName = points[selectedPoint].name;
      showConfirmation(`Supprimer "${deletedName}" ?`, () => {
        setPoints(points.filter((_, idx) => idx !== selectedPoint));
        setSelectedPoint(null);
        setFormData({ name: '', desc: '', lat: '', lon: '' });
        showNotification(`🗑️ ${deletedName} supprimé`);
      });
    }
  };


  return (
    <div className="app-container">
      {confirmation && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-message">{confirmation.message}</p>
            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() => {
                  confirmation.onCancel?.();
                  setConfirmation(null);
                }}
              >
                Annuler
              </button>
              <button
                className="btn-confirm"
                onClick={() => {
                  confirmation.onConfirm();
                  setConfirmation(null);
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && photos[lightbox.pointIndex] && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-lightbox" onClick={closeLightbox}>
              ✕
            </button>

            <button
              className="btn-nav-lightbox btn-prev"
              onClick={goToPreviousPhoto}
              title="Photo précédente"
            >
              ❮
            </button>

            <div className="lightbox-image-container">
              <img
                src={`http://localhost:3000/api/photo/${photos[lightbox.pointIndex][lightbox.photoIndex].id}`}
                alt="Photo agrandie"
              />
            </div>

            <button
              className="btn-nav-lightbox btn-next"
              onClick={goToNextPhoto}
              title="Photo suivante"
            >
              ❯
            </button>

            <div className="lightbox-info">
              {lightbox.photoIndex + 1} / {photos[lightbox.pointIndex].length}
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="map-container">
        <MapComponent
          points={points}
          onMapClick={handleMapClick}
          selectedPoint={selectedPoint}
          onPointClick={handleSelectPoint}
          tempMarkerPos={canEdit ? tempMarkerPos : null}
          onClearTemp={handleClearTemp}
        />
      </div>

      <div className="sidebar">
        <div className="header-section">
          <div className="header-top">
            <h1>Carte des Moulins</h1>
            {user ? (
              <button onClick={handleLogout} className="btn-logout-compact" title={user.email}>
                Déconnexion
              </button>
            ) : (
              <button onClick={handleLogin} className="btn-login-compact">
                Connexion Google
              </button>
            )}
          </div>
        </div>

        <div className="form-section">
          <h2>{selectedPoint !== null ? 'Modifier' : 'Ajouter'} un point</h2>

          <input
            type="text"
            placeholder="Nom du moulin"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={!canEdit}
            readOnly={!canEdit}
          />

          <textarea
            placeholder="Description"
            value={formData.desc}
            onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
            disabled={!canEdit}
            readOnly={!canEdit}
          />

          <div className="coord-group">
            <input
              type="number"
              placeholder="Latitude"
              value={formData.lat}
              onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
              step="0.000001"
              disabled={!canEdit}
              readOnly={!canEdit}
            />
            <input
              type="number"
              placeholder="Longitude"
              value={formData.lon}
              onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
              step="0.000001"
              disabled={!canEdit}
              readOnly={!canEdit}
            />
          </div>

          <div className="photos-section">
            <h3>📸 Photos</h3>
            {selectedPoint !== null ? (
              <>
                {canEdit && (
                  <label
                    className="file-input-label"
                    style={{ opacity: uploadingPhoto ? 0.6 : 1, cursor: uploadingPhoto ? 'not-allowed' : 'pointer' }}
                  >
                    {uploadingPhoto ? (
                      <>
                        <div className="upload-spinner"></div>
                        Téléchargement en cours...
                      </>
                    ) : (
                      <>
                        📤 Charger une photo
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadPhoto}
                      disabled={uploadingPhoto}
                      style={{ cursor: uploadingPhoto ? 'not-allowed' : 'pointer' }}
                    />
                  </label>
                )}

                {photos[selectedPoint] && photos[selectedPoint].length > 0 && (
                  <div className="photos-gallery">
                    {photos[selectedPoint].map((photo, idx) => (
                      <div key={idx} className="photo-item">
                        <div
                          className="photo-preview"
                          onClick={() => openLightbox(selectedPoint, idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          <img
                            src={`http://localhost:3000/api/photo/${photo.id}`}
                            alt={photo.name}
                          />
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleDeletePhoto(selectedPoint, idx)}
                            className="btn-delete-photo"
                            title="Supprimer"
                          >
                            ❌
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="no-selection">Sélectionne un moulin pour ajouter des photos</p>
            )}
          </div>

          {canEdit && (
            <div className="button-group">
              <button
                onClick={handleAddPoint}
                className="btn-primary"
              >
                {selectedPoint !== null ? '💾 Modifier' : '➕ Ajouter'}
              </button>
              {selectedPoint !== null && (
                <button
                  onClick={handleDeletePoint}
                  className="btn-danger"
                >
                  🗑️ Supprimer
                </button>
              )}
            </div>
          )}
        </div>

        <div className="points-list">
          <h3>Points ({points.length})</h3>
          <div className="list">
            {points.map((point, idx) => (
              <div
                key={idx}
                className={`point-item ${selectedPoint === idx ? 'active' : ''}`}
                onClick={() => handleSelectPoint(idx)}
              >
                <div
                  className="point-color"
                  style={{ backgroundColor: point.color }}
                ></div>
                <div className="point-info">
                  <strong>{point.name}</strong>
                  <small>{point.lat.toFixed(4)}, {point.lon.toFixed(4)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
