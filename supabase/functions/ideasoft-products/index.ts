// Supabase Edge Function - Ideasoft Products
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
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  const body = await req.json()
  const { shopId, accessToken, product } = body

  if (!shopId || !accessToken || !product) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Shop ID, Access Token ve Product gerekli' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    // Ideasoft API formatına göre ürün objesi oluştur (kategori bilgisi olmadan)
    const ideasoftProduct = {
      name: product.name || '',
      fullName: product.name || product.fullName || '',
      sku: product.sku || '',
      price1: product.price || product.price1 || 0,
      stockAmount: product.stock || product.stockAmount || 0.0,
      currency: {
        id: 1
      },
      status: product.status !== undefined ? product.status : 0 // 0 = Pasif
    }

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(ideasoftProduct)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw { response: { status: response.status, data: errorData } }
    }

    const responseData = await response.json()

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: any) {
    console.error('Products API Error:', error)
    
    // Ideasoft API'den gelen hata mesajını parse et
    let errorMessage = error.response?.data?.message || 
                      error.response?.data?.error || 
                      error.response?.data?.error_description ||
                      error.message ||
                      'Ürün oluşturulamadı'
    
    // Hata mesajını normalize et (string'e çevir)
    if (typeof errorMessage !== 'string') {
      errorMessage = JSON.stringify(errorMessage)
    }
    
    const errorLower = errorMessage.toLowerCase()
    
    // Duplicate ürün hatasını tespit et
    if (
      error.response?.status === 400 &&
      (
        errorLower.includes('duplicate') ||
        errorLower.includes('already exists') ||
        errorLower.includes('zaten var') ||
        errorLower.includes('aynı') ||
        errorLower.includes('mevcut') ||
        errorLower.includes('existing') ||
        errorLower.includes('unique') ||
        errorLower.includes('constraint') ||
        errorLower.includes('sku') && (errorLower.includes('unique') || errorLower.includes('duplicate'))
      )
    ) {
      errorMessage = 'Aynı üründen var (SKU veya ürün adı zaten kullanılıyor)'
    }
    
    // 400 hatası için daha açıklayıcı mesaj
    if (error.response?.status === 400 && !errorMessage.includes('Aynı üründen var')) {
      // Ideasoft API'den gelen detaylı hata mesajını kontrol et
      const errorData = error.response?.data
      if (errorData) {
        // Eğer errors array varsa, ilk hatayı al
        if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          const firstError = errorData.errors[0]
          if (firstError.message) {
            const firstErrorLower = firstError.message.toLowerCase()
            if (
              firstErrorLower.includes('duplicate') ||
              firstErrorLower.includes('already exists') ||
              firstErrorLower.includes('zaten var') ||
              firstErrorLower.includes('aynı') ||
              firstErrorLower.includes('unique')
            ) {
              errorMessage = 'Aynı üründen var (SKU veya ürün adı zaten kullanılıyor)'
            } else {
              errorMessage = firstError.message
            }
          }
        }
        // Eğer validation_errors varsa
        if (errorData.validation_errors) {
          const validationErrors = errorData.validation_errors
          const skuError = validationErrors.sku || validationErrors.SKU
          if (skuError && (skuError.includes('unique') || skuError.includes('duplicate'))) {
            errorMessage = 'Aynı üründen var (SKU zaten kullanılıyor)'
          }
        }
      }
    }
    
    console.log('📋 Parsed error message:', errorMessage)
    console.log('📋 Error response data:', JSON.stringify(error.response?.data, null, 2))
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        rawError: error.response?.data // Debug için
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.response?.status || 500 
      }
    )
  }
})

