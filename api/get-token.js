// Vercel Serverless Function - Ideasoft OAuth2 Token alma
import axios from 'axios'

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { clientId, clientSecret } = req.body

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID ve Client Secret gerekli' })
  }

  try {
    const response = await axios.post(
      'https://api.ideasoft.com.tr/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    return res.status(200).json({
      success: true,
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type
    })
  } catch (error) {
    console.error('Token alma hatası:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Token alınamadı'
    
    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage
    })
  }
}

