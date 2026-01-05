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
    const { productName, brand, features, categoryName, categoryId } = body || {}
    
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
    
    // Kategori bazlı prompt oluştur
    let categoryContext = '';
    if (categoryName) {
      categoryContext = `\nKategori: ${categoryName}`;
    }
    
    // Kategoriye göre örnek özellikler ve açıklama yönlendirmesi
    let categoryGuidance = '';
    if (categoryName) {
      const categoryLower = String(categoryName).toLowerCase();
      if (categoryLower.includes('anakart') || categoryLower.includes('motherboard')) {
        categoryGuidance = '\n\nBu ürün bir anakart olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- Yonga seti (chipset)\n- İşlemci desteği ve soket tipi\n- Bellek tipi ve kanal sayısı\n- Genişleme yuvaları (PCIe, M.2, SATA)\n- Ağ bağlantısı\n- Form faktörü (ATX, mATX, ITX vb.)';
      } else if (categoryLower.includes('işlemci') || categoryLower.includes('cpu') || categoryLower.includes('processor')) {
        categoryGuidance = '\n\nBu ürün bir işlemci olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- İşlemci ailesi ve modeli\n- Çekirdek sayısı ve thread sayısı\n- Temel ve boost saat hızı\n- Önbellek (cache) miktarı\n- TDP (Termal Tasarım Gücü)\n- Soket tipi\n- Üretim teknolojisi (nm)';
      } else if (categoryLower.includes('ekran kartı') || categoryLower.includes('gpu') || categoryLower.includes('graphics')) {
        categoryGuidance = '\n\nBu ürün bir ekran kartı olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- GPU modeli ve mimarisi\n- Video belleği (VRAM) miktarı ve tipi\n- Çekirdek saat hızı ve boost hızı\n- Bellek arayüzü ve bant genişliği\n- Güç tüketimi (TDP)\n- Bağlantı portları (HDMI, DisplayPort vb.)';
      } else if (categoryLower.includes('ram') || categoryLower.includes('bellek') || categoryLower.includes('memory')) {
        categoryGuidance = '\n\nBu ürün bir RAM modülü olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- Bellek tipi (DDR4, DDR5 vb.)\n- Kapasite (GB)\n- Hız (MHz)\n- Gecikme süreleri (CL timings)\n- Voltaj\n- Form faktörü (DIMM, SODIMM vb.)';
      } else if (categoryLower.includes('depolama') || categoryLower.includes('ssd') || categoryLower.includes('hdd') || categoryLower.includes('hard disk')) {
        categoryGuidance = '\n\nBu ürün bir depolama birimi olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- Depolama kapasitesi\n- Arayüz (SATA, NVMe, PCIe vb.)\n- Okuma/yazma hızları\n- Form faktörü (2.5", M.2, 3.5" vb.)\n- Dayanıklılık (TBW - Total Bytes Written)\n- Kontrolcü tipi';
      } else if (categoryLower.includes('televizyon') || categoryLower.includes('tv') || categoryLower.includes('monitör') || categoryLower.includes('display')) {
        categoryGuidance = '\n\nBu ürün bir görüntüleme cihazı olduğu için, aşağıdaki özellikleri öncelikle vurgulayın:\n- Ekran boyutu (inç)\n- Çözünürlük (4K, Full HD vb.)\n- Panel tipi (LED, OLED, QLED vb.)\n- Yenileme hızı (Hz)\n- Bağlantı portları (HDMI, USB, Wi-Fi vb.)\n- Ses sistemi\n- Akıllı TV özellikleri (varsa)';
      } else {
        categoryGuidance = `\n\nBu ürün "${categoryName}" kategorisinde olduğu için, bu kategoriye uygun teknik özellikleri ve bilgileri vurgulayın.`;
      }
    }
    
    // Prepare the prompt for Gemini
    const prompt = `Lütfen aşağıdaki ürün için kısa ve özlü bir açıklama oluşturun:

Ürün Adı: ${productName}
Marka: ${brand || 'Bilinmiyor'}${categoryContext}
Özellikler: ${features || 'Bilgi yok'}${categoryGuidance}

Açıklama aşağıdaki HTML tablo formatında başlamalı:
<div><strong><br /><table style="border-collapse:collapse;width:100%;"><tbody>

<tr><td>&nbsp;Özellik</td><td>Değer&nbsp;</td></tr>

<tr><td>&nbsp;Ürün Tipi</td><td>&nbsp;${categoryName || 'Ürün'}&nbsp;</td></tr>

<tr><td>&nbsp;Model</td><td>&nbsp;${productName}&nbsp;</td></tr>

${categoryGuidance ? '<!-- Kategoriye özel özellikler buraya eklenecek -->' : ''}

</tbody></table></strong></div><br/>

Ardından ürün hakkında detaylı açıklama metni gelmeli. Açıklama, ürünün kategorisine uygun teknik özellikleri ve kullanım alanlarını içermelidir.

Lütfen ürünle ilgili tüm teknik özellikleri ve bilgileri tabloya uygun şekilde yerleştirin. Kategori bilgisini dikkate alarak, o kategoriye özgü özellikleri öncelikle vurgulayın.`
    
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

