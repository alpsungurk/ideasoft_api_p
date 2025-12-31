import { useState, useEffect } from 'react';
import { initiateOAuth2Flow, getStoredToken } from '../services/ideasoftService';
import './ConfigForm.css';

const ConfigForm = ({ config, onSubmit }) => {
  const [formData, setFormData] = useState({
    shopId: config.shopId || '',
  });

  const [tokenForm, setTokenForm] = useState({
    clientId: '',
    clientSecret: '',
  });
  const [loadingToken, setLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const storedToken = getStoredToken();
    if (storedToken && storedToken.access_token) {
      setHasToken(true);
      if (storedToken.shopId) {
        setFormData((prev) => ({ ...prev, shopId: storedToken.shopId }));
      }
    } else {
      setHasToken(false);
    }
  }, []);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleTokenFormChange = (field, value) => {
    setTokenForm({ ...tokenForm, [field]: value });
    setTokenError('');
  };

  const handleOAuth2Login = () => {
    if (!tokenForm.clientId || !tokenForm.clientSecret || !formData.shopId) {
      setTokenError('Tüm alanların doldurulması zorunludur!');
      return;
    }
    setLoadingToken(true);
    const redirectUri = `${window.location.origin}/auth/callback`;
    localStorage.setItem('oauth2_clientSecret', tokenForm.clientSecret);
    localStorage.setItem('oauth2_shopId', formData.shopId);
    localStorage.setItem('oauth2_clientId', tokenForm.clientId);
    localStorage.setItem('oauth2_redirectUri', redirectUri);
    initiateOAuth2Flow(formData.shopId, tokenForm.clientId, redirectUri);
  };

  const handleContinueWithToken = () => {
    const storedToken = getStoredToken();
    if (storedToken && storedToken.access_token && onSubmit) {
      onSubmit({
        apiKey: storedToken.access_token,
        shopId: storedToken.shopId || formData.shopId,
      });
    }
  };

  return (
    <div className="config-form-container">
      <div className="config-form-header">
        <h2>🔐 Ideasoft API Bağlantısı</h2>
        <p>
          Uygulamayı kullanmak için lütfen Ideasoft API bilgilerinizi girin veya
          mevcut token ile devam edin.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleOAuth2Login(); }}>
        <div className="form-group">
          <label htmlFor="clientId">Client ID <span className="required">*</span></label>
          <input
            type="text"
            id="clientId"
            value={tokenForm.clientId}
            onChange={(e) => handleTokenFormChange('clientId', e.target.value)}
            placeholder="Ideasoft tarafından sağlanan Client ID"
            className="form-input"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="clientSecret">Client Secret <span className="required">*</span></label>
          <input
            type="password"
            id="clientSecret"
            value={tokenForm.clientSecret}
            onChange={(e) => handleTokenFormChange('clientSecret', e.target.value)}
            placeholder="****************"
            className="form-input"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="shopId">Shop ID (Mağaza Adı) <span className="required">*</span></label>
          <input
            type="text"
            id="shopId"
            value={formData.shopId}
            onChange={(e) => handleChange('shopId', e.target.value)}
            placeholder="ornek: demoshop"
            className="form-input"
            required
          />
        </div>
        
        <div className="form-hint">
            <strong>Callback URL:</strong> <code>{window.location.origin}/auth/callback</code>
             <br/>
            <span style={{ color: 'var(--success)', fontWeight: '500' }}>
               Bu adresi Ideasoft API ayarlarınıza eklemelisiniz.
            </span>
        </div>

        {tokenError && (
          <div className="error-message">⚠️ {tokenError}</div>
        )}

        <div style={{ marginTop: '24px', display: 'grid', gap: '12px' }}>
            <button
                type="submit"
                className="btn btn-primary btn-oauth"
                disabled={!tokenForm.clientId || !tokenForm.clientSecret || !formData.shopId || loadingToken}
            >
                {loadingToken ? 'Yönlendiriliyor...' : 'Ideasoft ile Giriş Yap'}
            </button>

            {hasToken && (
                <button
                type="button"
                onClick={handleContinueWithToken}
                className="btn btn-success"
                >
                ✅ Mevcut Token ile Devam Et
                </button>
            )}
        </div>
      </form>

      <div className="info-box">
        <h3>💡 Bilgilendirme</h3>
        <ul>
          <li>API bilgileriniz yalnızca sizin tarayıcınızda güvenli bir şekilde saklanır.</li>
          <li>Ürünler mağazanıza başlangıçta <strong>pasif</strong> olarak eklenir.</li>
          <li>Token süresi dolduğunda bu ekrandan yenilemeniz gerekir.</li>
          <li>
            Daha fazla bilgi için: {' '}
            <a href="https://www.ideasoft.com.tr/yardim/api-kullanimi/" target="_blank" rel="noopener noreferrer">
              Ideasoft API Dokümantasyonu
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ConfigForm;
