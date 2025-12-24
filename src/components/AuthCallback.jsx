import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exchangeCodeForToken } from '../services/ideasoftService'
import './AuthCallback.css'

const AuthCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')

      // Hata kontrolü
      if (error) {
        setStatus('error')
        setMessage(errorDescription || 'Yetkilendirme hatası')
        setTimeout(() => navigate('/'), 3000)
        return
      }

      // State kontrolü
      const storedState = localStorage.getItem('oauth2_state')
      if (state !== storedState) {
        setStatus('error')
        setMessage('Güvenlik hatası: State değeri eşleşmiyor')
        setTimeout(() => navigate('/'), 3000)
        return
      }

      // Code kontrolü
      if (!code) {
        setStatus('error')
        setMessage('Authorization code bulunamadı')
        setTimeout(() => navigate('/'), 3000)
        return
      }

      // Token al
      try {
        const shopId = localStorage.getItem('oauth2_shopId')
        const clientId = localStorage.getItem('oauth2_clientId')
        const clientSecret = localStorage.getItem('oauth2_clientSecret')
        const redirectUri = localStorage.getItem('oauth2_redirectUri')

        if (!shopId || !clientId || !clientSecret || !redirectUri) {
          throw new Error('Eksik bilgiler')
        }

        const tokenData = await exchangeCodeForToken(code, shopId, clientId, clientSecret, redirectUri)
        
        // Token'ı console'da göster
        console.log('✅ AuthCallback - Token Alındı:', tokenData)

        // EnrichData bilgisini al
        const enrichData = localStorage.getItem('oauth2_enrichData') === 'true'

        // Temizlik
        localStorage.removeItem('oauth2_state')
        localStorage.removeItem('oauth2_shopId')
        localStorage.removeItem('oauth2_clientId')
        localStorage.removeItem('oauth2_clientSecret')
        localStorage.removeItem('oauth2_redirectUri')
        localStorage.removeItem('oauth2_enrichData')

        setStatus('success')
        setMessage('Token başarıyla alındı! Excel yükleme sayfasına yönlendiriliyorsunuz...')
        
        setTimeout(() => {
          navigate('/')
        }, 2000)
      } catch (error) {
        setStatus('error')
        setMessage(error.message || 'Token alınamadı')
        setTimeout(() => navigate('/'), 3000)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="auth-callback">
      <div className="callback-card">
        {status === 'loading' && (
          <>
            <div className="spinner"></div>
            <h2>Token alınıyor...</h2>
            <p>Lütfen bekleyin</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="success-icon">✅</div>
            <h2>Başarılı!</h2>
            <p>{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="error-icon">❌</div>
            <h2>Hata!</h2>
            <p>{message}</p>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthCallback

