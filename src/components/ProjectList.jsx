import { useState, useEffect } from 'react';
import { getBatches } from '../services/databaseService';
import './ProjectList.css';

// A simple calendar icon component
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);


const ProjectList = ({ onSelectProject, onCreateNew }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getBatches();
      if (result.success) {
        // Sort projects by creation date, newest first
        const sortedProjects = result.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setProjects(sortedProjects);
      } else {
        setError(result.error || 'Projeler yüklenirken bir hata oluştu.');
      }
    } catch (err) {
      console.error('Projeler yüklenemedi:', err);
      setError('Veritabanı bağlantısı kurulamadı veya sunucu hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="project-list-container">
      <div className="project-list-header">
        <h2>📋 Kayıtlı Projeler</h2>
        <button onClick={onCreateNew} className="btn btn-primary">
          + Yeni Excel Yükle
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Projeler yükleniyor, lütfen bekleyin...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <h3>⚠️ Hata Oluştu</h3>
          <p>{error}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <p>Henüz herhangi bir ürün gönderimi yapılmamış.</p>
          <button onClick={onCreateNew} className="btn btn-secondary">
            İlk Projeni Oluştur
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card" onClick={() => onSelectProject(project.id)}>
              <div className="project-card-header">
                <h3>{project.name}</h3>
                <span className={`status-badge ${String(project.status).toLowerCase()}`}>
                  {project.status === 'COMPLETED' ? 'Tamamlandı' : 'İşleniyor'}
                </span>
              </div>
              <div className="project-date">
                <CalendarIcon />
                {formatDate(project.created_at)}
              </div>
              <div className="project-stats">
                <div className="stat-item">
                  <div className="stat-label">Toplam</div>
                  <div className="stat-value">{project.total_products}</div>
                </div>
                <div className="stat-item success">
                  <div className="stat-label">Başarılı</div>
                  <div className="stat-value">{project.successful_products}</div>
                </div>
                <div className="stat-item failed">
                  <div className="stat-label">Başarısız</div>
                  <div className="stat-value">{project.failed_products}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectList;
