import { useState, useEffect } from 'react';
import ProductImporter from './components/ProductImporter';
import ProjectList from './components/ProjectList';
import ProjectDetail from './components/ProjectDetail';
import ConfigForm from './components/ConfigForm';
import { getStoredToken } from './services/ideasoftService';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('list');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [config, setConfig] = useState({ apiKey: '', shopId: '' });
  const [loading, setLoading] = useState(true);
  const [hideHeader, setHideHeader] = useState(false);

  useEffect(() => {
    const storedToken = getStoredToken();
    if (storedToken && storedToken.access_token) {
      setIsAuthenticated(true);
      setConfig({
        apiKey: storedToken.access_token,
        shopId: storedToken.shopId
      });
    }
    setLoading(false);

    // Initial state push
    if (!window.history.state) {
      window.history.replaceState({ view: 'list', projectId: null, hideHeader: false }, '', '');
    }
  }, []);

  // Sync state with URL hash for persistence and history
  useEffect(() => {
    const syncStateFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setCurrentView('list');
        setSelectedProjectId(null);
        setHideHeader(false);
        return;
      }

      const [view, id] = hash.split('/');
      setCurrentView(view || 'list');
      setSelectedProjectId(id || null);

      // Auto-hide header for certain views if needed, 
      // but user asked for it to be visible in detail view
      setHideHeader(view === 'importer' && window.location.search.includes('step=3'));
    };

    window.addEventListener('hashchange', syncStateFromHash);
    syncStateFromHash(); // Check on mount

    return () => window.removeEventListener('hashchange', syncStateFromHash);
  }, []);

  const navigateTo = (view, projectId = null) => {
    const hash = projectId ? `${view}/${projectId}` : view;
    window.location.hash = hash;
  };

  const handleLoginSuccess = (newConfig) => {
    setConfig(newConfig);
    setIsAuthenticated(true);
    navigateTo('list');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setConfig({ apiKey: '', shopId: '' });
  };

  const handleCreateNew = () => {
    navigateTo('importer');
  };

  const handleSelectProject = (projectId) => {
    // User wants the header to be visible ("ikinci fotodaki kısımda gözükcek")
    navigateTo('detail', projectId, false);
  };

  const handleBackFromDetail = () => {
    navigateTo('list');
  };

  const handleImportComplete = () => {
    navigateTo('list');
  };

  if (loading) {
    return <div>Yükleniyor...</div>; // Simple loading state
  }

  return (
    <div className={`app ${hideHeader ? 'header-hidden' : ''}`}>
      <div className="container">
        {!hideHeader && (
          <header className="header card">
            <div className="header-top">
              <div>
                <h1>🚀 Ideasoft Ürün Aktarıcı</h1>
                <p>Excel dosyanızdan ürünleri Ideasoft mağazanıza aktarın</p>
              </div>
              {isAuthenticated && (
                <button onClick={handleLogout} className="btn btn-secondary">
                  🔒 API Ayarları
                </button>
              )}
            </div>

            {isAuthenticated && (
              <div className="tabs">
                <button
                  className={`tab-button ${currentView === 'list' || currentView === 'detail' ? 'active' : ''}`}
                  onClick={() => navigateTo('list')}
                >
                  📋 Projeler
                </button>
                <button
                  className={`tab-button ${currentView === 'importer' ? 'active' : ''}`}
                  onClick={() => navigateTo('importer')}
                >
                  📤 Yeni Excel Yükle
                </button>
              </div>
            )}
          </header>
        )}

        <main className="tab-content">
          {!isAuthenticated ? (
            <div className="card" style={{ maxWidth: '500px', margin: '3rem auto' }}>
              <ConfigForm config={config} onSubmit={handleLoginSuccess} />
            </div>
          ) : (
            <div className={`card ${hideHeader ? 'no-padding full-height-card' : ''}`} style={hideHeader ? {} : { padding: '30px' }}>
              {currentView === 'list' && (
                <ProjectList
                  onSelectProject={handleSelectProject}
                  onCreateNew={handleCreateNew}
                />
              )}
              {currentView === 'detail' && selectedProjectId && (
                <ProjectDetail
                  projectId={selectedProjectId}
                  appConfig={config}
                  onBack={handleBackFromDetail}
                />
              )}
              {currentView === 'importer' && (
                <ProductImporter
                  appConfig={config}
                  onComplete={handleImportComplete}
                  onStepChange={(step) => setHideHeader(step === 3)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
