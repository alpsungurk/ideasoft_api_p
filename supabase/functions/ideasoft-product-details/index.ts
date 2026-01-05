// Supabase Edge Function - Ideasoft Product Details
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper functions
const escapeHtml = (value: string) => {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const normalizeDetailsToHtml = (value: any) => {
  const s = String(value ?? '').trim()
  if (!s) return ''
  // Eğer HTML'e benziyorsa dokunma
  if (/<\s*\/?\s*[a-z][\s\S]*>/i.test(s)) return s
  // Plain text -> basit HTML
  const lines = s.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ''
  return lines.map((l: string) => `<p>${escapeHtml(l)}</p>`).join('')
}

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

const buildIdeasoftHeaders = (accessToken: string) => ({
  'Authorization': `Bearer ${accessToken}`,
  'Accept': 'application/json'
})

const fetchIdeasoftProductDetailForProduct = async ({ shopId, accessToken, ideasoftProductId, sku }: any) => {
  const headers = buildIdeasoftHeaders(accessToken)
  const baseUrl = `https://${shopId}.myideasoft.com/admin-api/product_details`
  const targetSku = normalizeSku(sku)
  const productId = Number(ideasoftProductId)

  const filterParamVariants = [
    targetSku ? { sku: targetSku } : null,
    Number.isFinite(productId) ? { productId } : null,
    Number.isFinite(productId) ? { product_id: productId } : null,
    targetSku ? { search: targetSku } : null,
    targetSku ? { query: targetSku } : null
  ].filter(Boolean)

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
      const hitBySku = targetSku ? findProductInListBySku(items, targetSku) : null
      if (hitBySku) return hitBySku
      if (Number.isFinite(productId)) {
        const hit = items.find((it: any) => Number(it?.product?.id) === productId)
        if (hit) return hit
      }
    } catch (_) {
      // ignore
    }
  }

  // Fallback: sayfalı tarama
  const pageParamVariants = [
    (page: number, limit: number) => ({ page, limit }),
    (page: number, limit: number) => ({ page, perPage: limit }),
    (page: number, limit: number) => ({ page, per_page: limit }),
    (page: number, limit: number) => ({ pageNumber: page, pageSize: limit })
  ]

  const limit = 100
  const maxPages = 10
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
        const hitBySku = targetSku ? findProductInListBySku(items, targetSku) : null
        if (hitBySku) return hitBySku
        if (Number.isFinite(productId)) {
          const hit = items.find((it: any) => Number(it?.product?.id) === productId)
          if (hit) return hit
        }
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
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Supabase bağlantısı yapılandırılmamış' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const body = await req.json()
    const { shopId, accessToken, localProductId, details, extraDetails, productDetailId } = body || {}

    console.log('📝 ProductDetail Request:', { 
      shopId: shopId ? '***' : null, 
      accessToken: accessToken ? '***' : null, 
      localProductId, 
      detailsLength: details?.length || 0,
      extraDetailsLength: extraDetails?.length || 0
    })

    // Detaylı validasyon ve hata mesajları
    if (!shopId) {
      console.error('❌ ProductDetail: Shop ID eksik')
      return new Response(
        JSON.stringify({ success: false, error: 'Shop ID gerekli', received: { shopId } }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    if (!accessToken) {
      console.error('❌ ProductDetail: Access Token eksik')
      return new Response(
        JSON.stringify({ success: false, error: 'Access Token gerekli', received: { accessToken: accessToken ? '***' : undefined } }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    if (!localProductId) {
      console.error('❌ ProductDetail: localProductId eksik', { body })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'localProductId gerekli', 
          received: { localProductId },
          body: Object.keys(body || {})
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // localProductId'yi number'a çevir
    const productId = Number(localProductId)
    if (isNaN(productId)) {
      console.error('❌ ProductDetail: localProductId geçersiz', { localProductId, type: typeof localProductId })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'localProductId geçerli bir sayı olmalı', 
          received: localProductId,
          type: typeof localProductId
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const { data: rows, error: dbError } = await supabaseClient
      .from('imported_products')
      .select('*')
      .eq('id', productId)
      .single()
    
    if (dbError || !rows) {
      console.error('❌ ProductDetail: Ürün bulunamadı', { productId, error: dbError?.message })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Ürün bulunamadı (ID: ${productId})` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    const p = rows
    const ideasoftProductId = p.ideasoft_product_id
    if (!ideasoftProductId) {
      console.error('❌ ProductDetail: ideasoft_product_id yok', { productId, sku: p.sku })
      return new Response(
        JSON.stringify({ success: false, error: 'Bu ürün henüz Ideasoft\'a aktarılmamış (ideasoft_product_id yok).' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const sku = String(p.sku || '').trim()
    if (!sku) {
      return new Response(
        JSON.stringify({ success: false, error: 'SKU boş olamaz' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // API dokümantasyonuna uygun payload oluştur
    const payload: any = {
      id: productDetailId ? Number(productDetailId) : undefined, // Opsiyonel: güncelleme için
      sku: sku,
      details: normalizeDetailsToHtml(details),
      extraDetails: normalizeDetailsToHtml(extraDetails),
      product: {
        id: Number(ideasoftProductId),
        name: p.name || '',
        fullName: p.name || '',
        sku: sku,
        stockAmount: Number(p.stock_amount || 0),
        price1: Number(p.price || 0),
        currency: { id: 1 },
        status: Number(p.status) === 1 ? 1 : 0
      }
    }

    // undefined alanları kaldır
    if (payload.id === undefined) {
      delete payload.id
    }

    console.log('📤 ProductDetail Payload:', {
      sku: payload.sku,
      detailsLength: payload.details?.length || 0,
      extraDetailsLength: payload.extraDetails?.length || 0,
      productId: payload.product.id,
      productName: payload.product.name
    })

    // Eğer productDetailId varsa PUT, yoksa POST yap
    const hasProductDetailId = productDetailId !== null && productDetailId !== undefined && Number(productDetailId) > 0
    const apiUrl = hasProductDetailId 
      ? `https://${shopId}.myideasoft.com/admin-api/product_details/${Number(productDetailId)}`
      : `https://${shopId}.myideasoft.com/admin-api/product_details`
    
    try {
      const response = await fetch(apiUrl, {
        method: hasProductDetailId ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw { response: { status: response.status, data: errorData } }
      }

      const responseData = await response.json()

      console.log('✅ ProductDetail başarıyla gönderildi:', { productId: ideasoftProductId, sku })
      return new Response(
        JSON.stringify({ success: true, data: responseData }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } catch (apiError: any) {
      // Duplicate entry hatası = zaten var, başarılı kabul et
      const responseData = apiError.response?.data
      const errorMessage = (
        typeof responseData === 'string'
          ? responseData
          : [
              responseData?.message,
              responseData?.error,
              responseData?.errorMessage,
              responseData?.error_description,
              // bazı API'ler detayları errors[] altında döndürebiliyor
              Array.isArray(responseData?.errors)
                ? responseData.errors.map((e: any) => e?.message || e?.error || e?.errorMessage).filter(Boolean).join(' | ')
                : undefined,
              // fallback: tüm body'yi stringleştir
              responseData ? JSON.stringify(responseData) : undefined,
              apiError.message
            ]
              .filter(Boolean)
              .join(' ')
      ).toLowerCase()

      const isDuplicate = apiError.response?.status === 400 && (
        errorMessage.includes('duplicate') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('zaten var')
      )

      if (isDuplicate) {
        // Duplicate ise: mevcut detail kaydını bulup PUT ile update dene
        try {
          const existing = await fetchIdeasoftProductDetailForProduct({
            shopId,
            accessToken,
            ideasoftProductId,
            sku
          })
          if (existing?.id) {
            const existingId = Number(existing.id)
            const updatePayload = { ...payload, id: existingId }
            const updateUrl = `https://${shopId}.myideasoft.com/admin-api/product_details/${existingId}`
            
            // PUT ile güncelle
            const updResp = await fetch(updateUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify(updatePayload)
            })

            if (!updResp.ok) {
              // PUT başarısız oldu, POST ile dene
              console.warn('⚠️ ProductDetail PUT başarısız, POST deneniyor:', updResp.status)
              const postUrl = `https://${shopId}.myideasoft.com/admin-api/product_details`
              const postResp = await fetch(postUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify(updatePayload)
              })

              if (!postResp.ok) {
                const errorData = await postResp.json().catch(() => ({}))
                throw { response: { status: postResp.status, data: errorData } }
              }

              const postRespData = await postResp.json()
              console.log('✅ ProductDetail duplicate sonrası POST ile güncellendi:', { productId: ideasoftProductId, sku, productDetailId: existingId })
              return new Response(
                JSON.stringify({ success: true, data: postRespData, updated: true }),
                { 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200 
                }
              )
            }

            const updRespData = await updResp.json()
            console.log('✅ ProductDetail duplicate sonrası PUT ile güncellendi:', { productId: ideasoftProductId, sku, productDetailId: existingId })
            return new Response(
              JSON.stringify({ success: true, data: updRespData, updated: true }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 
              }
            )
          }
        } catch (e: any) {
          console.error('⚠️ ProductDetail duplicate sonrası update denenemedi:', e?.message || e)
        }

        // Duplicate error'ı hata olarak döndür ama mesajı değiştir
        console.log('❌ ProductDetail duplicate hatası:', { productId: ideasoftProductId, sku })
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Aynı üründen var',
            statusCode: 400,
            duplicate: true
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        )
      }

      console.error('❌ Ideasoft API Hatası:', {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
        productId: ideasoftProductId,
        sku
      })
      throw apiError
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.response?.data?.errorMessage ||
      error.message ||
      'ProductDetail gönderilemedi'

    console.error('❌ ProductDetail endpoint hatası:', {
      errorMessage,
      status: error.response?.status,
      data: error.response?.data
    })

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        details: error.response?.data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.response?.status || 500 
      }
    )
  }
})

