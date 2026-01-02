// Supabase Edge Function - Gemini Validate API Key
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
      JSON.stringify({ valid: false, message: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  try {
    const body = await req.json()
    const { geminiApiKey } = body || {}
    
    if (!geminiApiKey || !geminiApiKey.trim()) {
      return new Response(
        JSON.stringify({ 
          valid: false,
          message: 'API Key gerekli' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    
    const trimmedKey = geminiApiKey.trim()
    
    // Test isteği gönder - basit bir prompt ile
    const testPrompt = 'Hello'
    const apiVersion = Deno.env.get('GEMINI_API_VERSION') || Deno.env.get('VITE_GEMINI_API_VERSION') || 'v1'
    const model = Deno.env.get('GEMINI_MODEL') || Deno.env.get('VITE_GEMINI_MODEL') || 'gemini-pro'
    const geminiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${trimmedKey}`
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const testResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: testPrompt
            }]
          }]
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => ({}))
        const status = testResponse.status
        const errorMessage = errorData?.error?.message || errorData?.error || 'Bilinmeyen hata'
        
        if (status === 400) {
          return new Response(
            JSON.stringify({ 
              valid: false,
              message: `API Key geçersiz: ${errorMessage}` 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )
        } else if (status === 403) {
          return new Response(
            JSON.stringify({ 
              valid: false,
              message: `API Key yetkisiz veya erişim reddedildi: ${errorMessage}` 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )
        } else if (status === 404) {
          return new Response(
            JSON.stringify({ 
              valid: false,
              message: `Model bulunamadı. Lütfen model adını kontrol edin: ${model}` 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )
        } else if (status === 429) {
          const errorMsg = errorData?.error?.message || ''
          const isQuotaExceeded = errorMsg.toLowerCase().includes('quota') || 
                                  errorMsg.toLowerCase().includes('limit') ||
                                  errorMsg.toLowerCase().includes('exceeded')
          return new Response(
            JSON.stringify({ 
              valid: false,
              message: isQuotaExceeded ? 'Gemini API keyi bitti. Lütfen yeni bir API key alın veya limitinizi kontrol edin.' : 'API kullanım limitine ulaşıldı, lütfen daha sonra tekrar deneyin'
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )
        } else {
          return new Response(
            JSON.stringify({ 
              valid: false,
              message: `API Key doğrulanamadı (${status}): ${errorMessage}` 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200 
            }
          )
        }
      }

      const responseData = await testResponse.json()
      
      // Response yapısını kontrol et
      const hasValidResponse = responseData && 
                                responseData.candidates && 
                                Array.isArray(responseData.candidates) && 
                                responseData.candidates.length > 0 &&
                                responseData.candidates[0].content &&
                                responseData.candidates[0].content.parts
      
      if (hasValidResponse) {
        return new Response(
          JSON.stringify({ 
            valid: true,
            message: 'API Key geçerli' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      } else {
        return new Response(
          JSON.stringify({ 
            valid: false,
            message: 'API Key geçerli değil - Geçersiz yanıt formatı' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
    } catch (apiError: any) {
      // API hatası kontrolü
      if (apiError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            valid: false,
            message: 'API Key doğrulama zaman aşımına uğradı' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      } else {
        // Diğer hatalar
        return new Response(
          JSON.stringify({ 
            valid: false,
            message: `API Key doğrulanamadı: ${apiError.message || 'Bilinmeyen hata'}` 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        valid: false,
        message: error.message || 'API Key doğrulanamadı' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
