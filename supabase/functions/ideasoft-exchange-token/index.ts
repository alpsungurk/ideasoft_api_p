// Supabase Edge Function - Ideasoft OAuth2 Token Exchange
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  try {
    const body = await req.json()
    const { code, shopId, clientId, clientSecret, redirectUri } = body

    console.log('📥 Exchange token request:', {
      hasCode: !!code,
      shopId: shopId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri: redirectUri
    })

    if (!code || !shopId || !clientId || !clientSecret || !redirectUri) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Code, Shop ID, Client ID, Client Secret ve Redirect URI gerekli' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    try {
      const tokenUrl = `https://${shopId}.myideasoft.com/oauth/v2/token`
      console.log('🔄 Token URL:', tokenUrl)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: redirectUri
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw { response: { status: response.status, data: errorData } }
      }

      const responseData = await response.json()

      console.log('✅ Token alındı')

      return new Response(
        JSON.stringify({
          success: true,
          access_token: responseData.access_token,
          refresh_token: responseData.refresh_token,
          expires_in: responseData.expires_in,
          token_type: responseData.token_type,
          scope: responseData.scope
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } catch (error: any) {
      console.error('❌ Token alma hatası:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      })
    
      let errorMessage = 'Token alınamadı'
      let statusCode = 500
      
      if (error.response) {
        const errorData = error.response.data || {}
        errorMessage = errorData.error_description || 
                      errorData.error || 
                      errorData.message ||
                      error.message ||
                      'Token alınamadı'
    
        // Daha açıklayıcı hata mesajları
        if (errorData.error === 'invalid_grant') {
          if (errorData.error_description?.includes("Code doesn't exist")) {
            errorMessage = 'Authorization code geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.'
          } else {
            errorMessage = 'Authorization code hatası: ' + (errorData.error_description || 'Geçersiz kod')
          }
        } else if (errorData.error === 'invalid_client') {
          errorMessage = 'Client ID veya Client Secret hatalı. Lütfen kontrol edin.'
        } else if (errorData.error === 'redirect_uri_mismatch') {
          errorMessage = 'Redirect URI eşleşmiyor. Ideasoft panelinde kayıtlı Redirect URI ile eşleştiğinden emin olun. Beklenen: ' + redirectUri
        }
        statusCode = error.response.status
      } else if (error.name === 'AbortError') {
        errorMessage = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.'
      } else {
        errorMessage = error.message || 'Bilinmeyen hata oluştu'
      }
    
      return new Response(
        JSON.stringify({
          success: false,
          error: String(errorMessage)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: statusCode 
        }
      )
    }
  } catch (error: any) {
    console.error('❌ Handler hatası:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Sunucu hatası: ' + String(error.message || 'Bilinmeyen hata')
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

