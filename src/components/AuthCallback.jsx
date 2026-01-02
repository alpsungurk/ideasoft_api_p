import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCodeForToken } from '../services/ideasoftService';
import './AuthCallback.css';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Ideasoft ile bağlantı kuruluyor, lütfen bekleyin...');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage('Yetkilendirme sırasında bir hata oluştu. Lütfen tekrar deneyin.');
        setTimeout(() => navigate('/'), 4000);
        return;
      }

      const storedState = localStorage.getItem('oauth2_state');
      if (state !== storedState) {
        setStatus('error');
        setMessage('Güvenlik doğrulaması başarısız. Lütfen işlemi yeniden başlatın.');
        setTimeout(() => navigate('/'), 4000);
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('Geçerli bir yetkilendirme kodu bulunamadı.');
        setTimeout(() => navigate('/'), 4000);
        return;
      }

      try {
        const shopId = localStorage.getItem('oauth2_shopId');
        const clientId = localStorage.getItem('oauth2_clientId');
        const clientSecret = localStorage.getItem('oauth2_clientSecret');
        const redirectUri = localStorage.getItem('oauth2_redirectUri');

        if (!shopId || !clientId || !clientSecret || !redirectUri) {
          throw new Error('Yapılandırma bilgileri eksik. Lütfen tekrar deneyin.');
        }

        await exchangeCodeForToken(code, shopId, clientId, clientSecret, redirectUri);
        
        // Clean up localStorage
        ['oauth2_state', 'oauth2_shopId', 'oauth2_clientId', 'oauth2_clientSecret', 'oauth2_redirectUri'].forEach(item => localStorage.removeItem(item));

        setStatus('success');
        setMessage('Bağlantı başarılı! Ana sayfaya yönlendiriliyorsunuz...');
        
        setTimeout(() => navigate('/'), 2000);

      } catch (err) {
        setStatus('error');
        const errorMsg = err.response?.data?.error || err.message || 'Token alınırken bir hata oluştu.';
        setMessage(String(errorMsg));
        setTimeout(() => navigate('/'), 4000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const renderStatus = () => {
    switch (status) {
      case 'success':
        return (
          <>
            <div className="status-icon success">✅</div>
            <h2>Başarılı!</h2>
            <p>{message}</p>
          </>
        );
      case 'error':
        return (
          <>
            <div className="status-icon error">❌</div>
            <h2>Hata Oluştu</h2>
            <p>{message}</p>
          </>
        );
      default: // loading
        return (
          <>
            <div className="spinner"></div>
            <h2>İşleniyor...</h2>
            <p>{message}</p>
          </>
        );
    }
  };

  return (
    <div className="auth-callback-page">
      <div className="card auth-card">
        {renderStatus()}
      </div>
    </div>
  );
};

export default AuthCallback;
