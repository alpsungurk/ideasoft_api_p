import { useState, useEffect } from 'react'
import { initiateOAuth2Flow, getStoredToken } from '../services/ideasoftService'
import './ConfigForm.css'

const ConfigForm = ({ config, onSubmit, onBack }) => {
  const [formData, setFormData] = useState({
    shopId: config.shopId || 'ilkteknomarket'
  })
  
  const [tokenForm, setTokenForm] = useState({
    clientId: '',
    clientSecret: ''
  })
  const [loadingToken, setLoadingToken] = useState(false)
  const [tokenError, setTokenError] = useState('')

  const [hasToken, setHasToken] = useState(false)

  // Sayfa yüklendiğinde kayıtlı token'ı kontrol et
  useEffect(() => {
    const storedToken = getStoredToken()
    if (storedToken && storedToken.access_token) {
      setHasToken(true)
      if (storedToken.shopId) {
        setFormData(prev => ({
          ...prev,
          shopId: storedToken.shopId
        }))
      }
      // Token varsa bile açılış sayfası token alma olacak
      // Kullanıcı "Devam Et" butonu ile Excel yükleme adımına geçebilir
    } else {
      setHasToken(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (field, value) => {
    setFormData({
      ...formData,
      [field]: value
    })
  }

  const handleTokenFormChange = (field, value) => {
    setTokenForm({
      ...tokenForm,
      [field]: value
    })
    setTokenError('')
  }

  const handleOAuth2Login = () => {
    if (!tokenForm.clientId || !tokenForm.clientSecret || !formData.shopId) {
      setTokenError('Lütfen Client ID, Client Secret ve Shop ID giriniz!')
      return
    }

    // Redirect URI - Uygulamanın callback URL'i
    const redirectUri = `${window.location.origin}/auth/callback`
    
    // Bilgileri localStorage'a kaydet (callback'te kullanılacak)
    localStorage.setItem('oauth2_clientSecret', tokenForm.clientSecret)
    localStorage.setItem('oauth2_shopId', formData.shopId)
    localStorage.setItem('oauth2_clientId', tokenForm.clientId)
    localStorage.setItem('oauth2_redirectUri', redirectUri)
    
    // OAuth 2.0 akışını başlat
    initiateOAuth2Flow(formData.shopId, tokenForm.clientId, redirectUri)
  }

  return (
    <div className="config-form-container">
      <form className="config-form">
        <div className="token-section">
          <div className="token-section-header">
            <h4>🔐 Ideasoft API Bilgileri</h4>
            <p>Client ID ve Client Secret ile OAuth 2.0 yetkilendirme yapın</p>
          </div>
          
          <div className="form-group">
            <label htmlFor="clientId">
              Client ID <span className="required">*</span>
            </label>
            <input
              type="text"
              id="clientId"
              value={tokenForm.clientId}
              onChange={(e) => handleTokenFormChange('clientId', e.target.value)}
              placeholder="Client ID'nizi girin"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="clientSecret">
              Client Secret <span className="required">*</span>
            </label>
            <input
              type="password"
              id="clientSecret"
              value={tokenForm.clientSecret}
              onChange={(e) => handleTokenFormChange('clientSecret', e.target.value)}
              placeholder="Client Secret'ınızı girin"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="shopId">
              Shop ID <span className="required">*</span>
            </label>
            <input
              type="text"
              id="shopId"
              value={formData.shopId}
              onChange={(e) => handleChange('shopId', e.target.value)}
              placeholder="Mağaza ID'nizi girin"
              className="form-input"
              required
            />
            <small className="form-hint">
              Ideasoft mağaza ID'niz (örn: ilkteknomarket)
            </small>
          </div>

          <small className="form-hint">
            <strong>Redirect URI:</strong> {window.location.origin}/auth/callback
            <br />
            <span style={{ color: '#059669', fontSize: '0.9rem' }}>
              ✅ Bu URI'yi Ideasoft admin panelinde kaydetmeniz gerekiyor.
            </span>
          </small>

          {tokenError && (
            <div className="error-message">
              ⚠️ {tokenError}
            </div>
          )}

          <button
            type="button"
            onClick={handleOAuth2Login}
            className="btn btn-oauth"
            disabled={!tokenForm.clientId || !tokenForm.clientSecret || !formData.shopId || loadingToken}
          >
            {loadingToken ? 'Yönlendiriliyor...' : '🔐 Ideasoft ile Giriş Yap'}
          </button>

          {/* Token varsa devam et butonu */}
          {hasToken && (
            <button
              type="button"
              onClick={() => {
                const storedToken = getStoredToken()
                if (storedToken && storedToken.access_token && onSubmit) {
                  onSubmit({
                    apiKey: storedToken.access_token,
                    shopId: storedToken.shopId || formData.shopId
                  })
                }
              }}
              className="btn btn-success"
              style={{ marginTop: '15px', width: '100%' }}
            >
              ✅ Token Mevcut - Devam Et →
            </button>
          )}
        </div>

      </form>

      <div className="config-info">
        <h3>💡 Bilgi</h3>
        <ul>
          <li>Access Token ve Shop ID bilgileriniz sadece tarayıcınızda saklanır</li>
          <li>Ürünler <strong>pasif</strong> durumda eklenecektir (aktifleştirmek için Ideasoft panelinden kontrol edin)</li>
          <li>İşlem sırasında ilerlemeyi takip edebilirsiniz</li>
          <li>Token süresi dolduğunda yeniden token almanız gerekebilir</li>
          <li>Ideasoft API dokümantasyonu: <a href="https://www.ideasoft.com.tr/yardim/api-kullanimi/" target="_blank" rel="noopener noreferrer">API Kullanımı</a></li>
        </ul>
      </div>
    </div>
  )
}

export default ConfigForm

