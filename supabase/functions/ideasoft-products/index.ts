// Supabase Edge Function - Ideasoft Products
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper functions
const normalizeSku = (sku: any) => String(sku ?? '').trim()

const extractIdeasoftListItems = (data: any) => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.products)) return data.products
  return []
}

const findProductInListBySku = (items: any[], sku: string) => {
  const target = normalizeSku(sku)
  if (!target) return null
  for (const it of items) {
    const itSku = normalizeSku(it?.sku)
    if (itSku && itSku === target) return it
  }
  return null
}

// SKU ile ürün bul
const findProductBySku = async (shopId: string, accessToken: string, sku: string) => {
  const targetSku = normalizeSku(sku)
  if (!targetSku) return null

  const baseUrl = `https://${shopId}.myideasoft.com/admin-api/products`
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  }

  // Try common server-side filters first
  const filterParamVariants = [
    { sku: targetSku },
    { search: targetSku },
    { query: targetSku },
    { keyword: targetSku }
  ]

  for (const params of filterParamVariants) {
    try {
      const searchUrl = new URL(baseUrl)
      Object.entries(params).forEach(([key, value]) => {
        searchUrl.searchParams.set(key, String(value))
      })
      
      const resp = await fetch(searchUrl.toString(), { headers })
      if (!resp.ok) continue
      
      const respData = await resp.json().catch(() => null)
      if (!respData) continue
      
      const items = extractIdeasoftListItems(respData)
      const hit = findProductInListBySku(items, targetSku)
      if (hit) return hit
    } catch (_) {
      // ignore and fallback
    }
  }

  // Fallback: scan paginated lists (best-effort)
  const pageParamVariants = [
    (page: number, limit: number) => ({ page, limit }),
    (page: number, limit: number) => ({ page, perPage: limit }),
    (page: number, limit: number) => ({ page, per_page: limit }),
    (page: number, limit: number) => ({ pageNumber: page, pageSize: limit })
  ]

  const limit = 100
  const maxPages = 5 // Limit to 5 pages for performance

  for (const buildParams of pageParamVariants) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const searchUrl = new URL(baseUrl)
        const params = buildParams(page, limit)
        Object.entries(params).forEach(([key, value]) => {
          searchUrl.searchParams.set(key, String(value))
        })
        
        const resp = await fetch(searchUrl.toString(), { headers })
        if (!resp.ok) break
        
        const respData = await resp.json().catch(() => null)
        if (!respData) break
        
        const items = extractIdeasoftListItems(respData)
        if (!items || items.length === 0) break
        
        const hit = findProductInListBySku(items, targetSku)
        if (hit) return hit
      } catch (_) {
        break
      }
    }
  }

  return null
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

