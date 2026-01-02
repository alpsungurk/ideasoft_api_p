// Supabase Edge Function - Gemini Generate Product Description
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
    const { productName, brand, features } = body || {}
    
    // Validate required parameters
    if (!productName) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'productName gerekli' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    
    // Get Gemini API key from request body only
    const geminiApiKey = body?.geminiApiKey
    
    if (!geminiApiKey || !geminiApiKey.trim()) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Gemini API Key gerekli' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    
    // Prepare the prompt for Gemini
    const prompt = `Lütfen aşağıdaki ürün için kısa ve özlü bir açıklama oluşturun:

Ürün Adı: ${productName}
Marka: ${brand || 'Bilinmiyor'}
Özellikler: ${features || 'Bilgi yok'}

Açıklama aşağıdaki HTML tablo formatında başlamalı:
<div><strong><br /><table style="border-collapse:collapse;width:100%;"><tbody>

<tr><td>&nbsp;Özellik</td><td>Değer&nbsp;</td></tr>

<tr><td>&nbsp;Ürün Tipi</td><td>&nbsp;Workstation Anakartı&nbsp;</td></tr>

<tr><td>&nbsp;Model</td><td>&nbsp;PRO WS WRX90E-SAGE SE&nbsp;</td></tr>

<tr><td>&nbsp;Yonga Seti</td><td>&nbsp;AMD WRX90&nbsp;</td></tr>

<tr><td>&nbsp;İşlemci Desteği</td><td>&nbsp;AMD Ryzen Threadripper PRO 7000WX Serisi (sTR5 Soket)&nbsp;</td></tr>

<tr><td>&nbsp;Bellek Tipi</td><td>&nbsp;8 Kanal DDR5 ECC RDIMM&nbsp;</td></tr>

<tr><td>&nbsp;Genişleme Yuvaları</td><td>&nbsp;Çoklu PCIe 5.0 x16&nbsp;</td></tr>

<tr><td>&nbsp;Depolama</td><td>&nbsp;M.2 (PCIe 5.0/4.0), SATA 6Gb/s&nbsp;</td></tr>

<tr><td>&nbsp;Ağ Bağlantısı</td><td>&nbsp;Çift 10 Gigabit Ethernet (10GbE)&nbsp;</td></tr>

<tr><td>&nbsp;Form Faktörü</td><td>&nbsp;E-ATX / CEB&nbsp;</td></tr>

<tr><td>&nbsp;Fiyat</td><td>&nbsp;1200 Birim&nbsp;</td></tr>

</tbody></table></strong></div><br/>

Ardından ürün hakkında detaylı açıklama metni gelmeli.

Lütfen ürünle ilgili tüm teknik özellikleri ve bilgileri tabloya uygun şekilde yerleştirin.`
    
    // Call Gemini API directly using fetch
    const apiVersion = Deno.env.get('GEMINI_API_VERSION') || Deno.env.get('VITE_GEMINI_API_VERSION') || 'v1'
    const model = Deno.env.get('GEMINI_MODEL') || Deno.env.get('VITE_GEMINI_MODEL') || 'gemini-pro'
    const geminiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${geminiApiKey}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}))
      const status = geminiResponse.status
      const errorMessage = errorData?.error?.message || errorData?.error || 'Bilinmeyen hata'
      
      if (status === 429) {
        const errorMsg = errorData?.error?.message || ''
        const isQuotaExceeded = errorMsg.toLowerCase().includes('quota') ||
                                errorMsg.toLowerCase().includes('limit') ||
                                errorMsg.toLowerCase().includes('exceeded')
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: isQuotaExceeded ? 'Gemini API keyi bitti. Lütfen yeni bir API key alın veya limitinizi kontrol edin.' : 'API kullanım limitine ulaşıldı, lütfen daha sonra tekrar deneyin',
            quotaExceeded: true
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Gemini API hatası (${status}): ${errorMessage}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }
    
    const responseData = await geminiResponse.json()
    
    // Extract the generated description from response
    const description = responseData.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    
    if (!description) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Ürün açıklaması oluşturulamadı' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        description: description 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
    
  } catch (error: any) {
    console.error('Gemini API Error:', error.message || error)
    
    let errorMessage = error.message || 'Ürün açıklaması oluşturulurken bir hata oluştu'
    let statusCode = 500
    let quotaExceeded = false

    if (error.name === 'AbortError') {
      errorMessage = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.'
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        quotaExceeded: quotaExceeded
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode 
      }
    )
  }
})

