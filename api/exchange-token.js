// Vercel Serverless Function - OAuth2 Authorization Code ile Token alma
const axios = require('axios')

module.exports = async function handler(req, res) {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ 
        success: false,
        error: 'Method not allowed' 
      })
    }

    const { code, shopId, clientId, clientSecret, redirectUri } = req.body

    console.log('📥 Exchange token request:', {
      hasCode: !!code,
      shopId: shopId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri: redirectUri
    })

    if (!code || !shopId || !clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({ 
        success: false,
        error: 'Code, Shop ID, Client ID, Client Secret ve Redirect URI gerekli' 
      })
    }

    try {
      const tokenUrl = `https://${shopId}.myideasoft.com/oauth/v2/token`
      console.log('🔄 Token URL:', tokenUrl)

      const response = await axios.post(
        tokenUrl,
        {
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      )

      console.log('✅ Token alındı')

      return res.status(200).json({
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
        scope: response.data.scope
      })
    } catch (error) {
      console.error('❌ Token alma hatası:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      })
      
      let errorMessage = 'Token alınamadı'
      
      if (error.response) {
        errorMessage = error.response.data?.error_description || 
                      error.response.data?.error || 
                      error.response.data?.message ||
                      error.message ||
                      'Token alınamadı'
        
        // Daha açıklayıcı hata mesajları
        if (error.response.data?.error === 'invalid_grant') {
          if (error.response.data?.error_description?.includes("Code doesn't exist")) {
            errorMessage = 'Authorization code geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.'
          } else {
            errorMessage = 'Authorization code hatası: ' + (error.response.data?.error_description || 'Geçersiz kod')
          }
        } else if (error.response.data?.error === 'invalid_client') {
          errorMessage = 'Client ID veya Client Secret hatalı. Lütfen kontrol edin.'
        } else if (error.response.data?.error === 'redirect_uri_mismatch') {
          errorMessage = 'Redirect URI eşleşmiyor. Ideasoft panelinde kayıtlı Redirect URI ile eşleştiğinden emin olun. Beklenen: ' + redirectUri
        }
      } else if (error.request) {
        errorMessage = 'Ideasoft API\'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.'
      } else {
        errorMessage = error.message || 'Bilinmeyen hata oluştu'
      }
      
      return res.status(error.response?.status || 500).json({
        success: false,
        error: String(errorMessage)
      })
    }
  } catch (error) {
    console.error('❌ Handler hatası:', error)
    return res.status(500).json({
      success: false,
      error: 'Sunucu hatası: ' + String(error.message || 'Bilinmeyen hata')
    })
  }
}

