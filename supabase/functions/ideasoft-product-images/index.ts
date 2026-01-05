// Supabase Edge Function - Ideasoft Product Images
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper functions
const inferImageExtension = (contentType: string | null, url: string | null) => {
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('bmp')) return 'bmp'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  const u = String(url || '').toLowerCase()
  const m = u.match(/\.(png|jpg|jpeg|webp|gif|bmp)(\?|#|$)/)
  if (!m) return 'jpg'
  return m[1] === 'jpeg' ? 'jpg' : m[1]
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

const buildIdeasoftHeaders = (accessToken: string) => ({
  'Authorization': `Bearer ${accessToken}`,
  'Accept': 'application/json'
})

const fetchIdeasoftProductImagesForProduct = async ({ shopId, accessToken, ideasoftProductId }: any) => {
  const headers = buildIdeasoftHeaders(accessToken)
  const baseUrl = `https://${shopId}.myideasoft.com/admin-api/product_images`
  const productId = Number(ideasoftProductId)

  const filterParamVariants = [
    Number.isFinite(productId) ? { productId } : null,
    Number.isFinite(productId) ? { product_id: productId } : null
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
      if (items && items.length) return items
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
        const filtered = items.filter((it: any) => Number(it?.product?.id) === productId)
        if (filtered.length) return filtered
      } catch (_) {
        break
      }
    }
  }

  return []
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
    const { shopId, accessToken, localProductId, imageUrl, ideasoftProductId, imageId, productImageId, filename, extension, sortOrder, thumbUrl, originalUrl, alt, attachment } = body || {}

    if (!shopId || !accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Shop ID ve Access Token gerekli' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }
    if (!imageUrl && !attachment) {
      return new Response(
        JSON.stringify({ success: false, error: 'imageUrl veya attachment (base64) gerekli' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    let resolvedIdeasoftProductId = ideasoftProductId
    if (!resolvedIdeasoftProductId && localProductId) {
      const { data: rows, error: dbError } = await supabaseClient
        .from('imported_products')
        .select('*')
        .eq('id', localProductId)
        .single()
      
      if (dbError) {
        throw new Error(`Ürün bulunamadı: ${dbError.message}`)
      }
      if (!rows) {
        return new Response(
          JSON.stringify({ success: false, error: 'Ürün bulunamadı' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 
          }
        )
      }
      resolvedIdeasoftProductId = rows.ideasoft_product_id
    }
    if (!resolvedIdeasoftProductId) {
      return new Response(
        JSON.stringify({ success: false, error: 'ideasoftProductId gerekli (veya localProductId üzerinden DB\'de ideasoft_product_id olmalı)' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    let attachmentData: string | null = null
    let resolvedFilename = filename
    let resolvedExtension = extension

    // Eğer imageUrl varsa, resmi indir ve base64'e çevir
    if (imageUrl) {
      // URL'yi normalize et: // ile başlıyorsa https:// ekle
      let normalizedImageUrl = String(imageUrl || '').trim()
      if (normalizedImageUrl && normalizedImageUrl.startsWith('//')) {
        normalizedImageUrl = 'https:' + normalizedImageUrl
      }
      
      // URL geçerliliğini kontrol et
      if (!normalizedImageUrl || !normalizedImageUrl.match(/^https?:\/\//i)) {
        return new Response(
          JSON.stringify({ success: false, error: `Geçersiz image URL: ${imageUrl}` }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        )
      }
      
      const imgResp = await fetch(normalizedImageUrl)
      if (!imgResp.ok) {
        throw new Error(`Image download failed: ${imgResp.status} ${imgResp.statusText}`)
      }
      const contentType = imgResp.headers.get('content-type')
      resolvedExtension = resolvedExtension || inferImageExtension(contentType, imageUrl)
      // Deno'da arraybuffer'ı base64'e çevir
      const arrayBuffer = await imgResp.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('')
      attachmentData = btoa(binaryString)
      resolvedFilename = resolvedFilename || `product-${resolvedIdeasoftProductId}.${resolvedExtension}`
    } else if (attachment) {
      // Eğer direkt attachment (base64) gönderilmişse, onu kullan
      attachmentData = attachment.includes('base64,') ? attachment.split('base64,')[1] : attachment
      // Filename'den extension çıkar veya varsayılan kullan
      if (resolvedFilename) {
        const match = resolvedFilename.match(/\.([^.]+)$/)
        if (match) resolvedExtension = resolvedExtension || match[1]
      }
      resolvedExtension = resolvedExtension || 'jpg'
      resolvedFilename = resolvedFilename || `product-${resolvedIdeasoftProductId}.${resolvedExtension}`
    }

    // productImageId veya imageId kullan (productImageId öncelikli)
    const resolvedImageId = productImageId !== null && productImageId !== undefined ? Number(productImageId) : (imageId ? Number(imageId) : undefined)
    
    // API dokümantasyonuna uygun payload oluştur
    const payload: any = {
      id: resolvedImageId, // Opsiyonel: güncelleme için
      filename: resolvedFilename || `product-${resolvedIdeasoftProductId}.jpg`,
      extension: resolvedExtension || 'jpg',
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 1,
      thumbUrl: thumbUrl || undefined, // Opsiyonel
      originalUrl: originalUrl || undefined, // Opsiyonel
      attachment: attachmentData ? (attachmentData.includes('data:') ? attachmentData : `data:image/${resolvedExtension || 'jpg'};base64,${attachmentData}`) : undefined,
      alt: alt || undefined, // Opsiyonel
      product: {
        id: Number(resolvedIdeasoftProductId)
      }
    }

    // undefined alanları kaldır
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key]
      }
    })

    // Eğer resolvedImageId varsa PUT, yoksa POST yap
    const hasImageId = resolvedImageId !== null && resolvedImageId !== undefined && Number(resolvedImageId) > 0
    const apiUrl = hasImageId
      ? `https://${shopId}.myideasoft.com/admin-api/product_images/${Number(resolvedImageId)}`
      : `https://${shopId}.myideasoft.com/admin-api/product_images`
    
    try {
      const response = await fetch(apiUrl, {
        method: hasImageId ? 'PUT' : 'POST',
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

      console.log('✅ ProductImage başarıyla gönderildi:', { productId: resolvedIdeasoftProductId, filename: resolvedFilename })
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
        // Duplicate ise: mümkünse mevcut image kaydını bulup PUT ile update dene
        try {
          const images = await fetchIdeasoftProductImagesForProduct({
            shopId,
            accessToken,
            ideasoftProductId: resolvedIdeasoftProductId
          })
          const hit = images.find((it: any) => String(it?.filename || '').toLowerCase() === String(payload.filename || '').toLowerCase())
            || images.find((it: any) => Number(it?.sortOrder || it?.sort_order || 0) === Number(payload.sortOrder || 1))
            || images[0]
          if (hit?.id) {
            const existingId = Number(hit.id)
            const updatePayload = { ...payload, id: existingId }
            const updateUrl = `https://${shopId}.myideasoft.com/admin-api/product_images/${existingId}`
            
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
              console.warn('⚠️ ProductImage PUT başarısız, POST deneniyor:', updResp.status)
              const postUrl = `https://${shopId}.myideasoft.com/admin-api/product_images`
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
              console.log('✅ ProductImage duplicate sonrası POST ile güncellendi:', { productId: resolvedIdeasoftProductId, filename: payload.filename, imageId: existingId })
              return new Response(
                JSON.stringify({ success: true, data: postRespData, updated: true }),
                { 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200 
                }
              )
            }

            const updRespData = await updResp.json()
            console.log('✅ ProductImage duplicate sonrası PUT ile güncellendi:', { productId: resolvedIdeasoftProductId, filename: payload.filename, imageId: existingId })
            return new Response(
              JSON.stringify({ success: true, data: updRespData, updated: true }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 
              }
            )
          }
        } catch (e: any) {
          console.error('⚠️ ProductImage duplicate sonrası update denenemedi:', e?.message || e)
        }

        // Duplicate error'ı hata olarak döndür ama mesajı değiştir
        // SKU bilgisini almak için veritabanından çek
        let productSku = ''
        try {
          if (localProductId) {
            const { data: rows } = await supabaseClient
              .from('imported_products')
              .select('sku')
              .eq('id', localProductId)
              .single()
            if (rows) {
              productSku = rows.sku || ''
            }
          }
        } catch (e: any) {
          console.error('SKU bilgisi alınamadı:', e)
        }

        console.log('❌ ProductImage duplicate hatası:', { productId: resolvedIdeasoftProductId, filename: resolvedFilename, sku: productSku })
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

      console.error('❌ Ideasoft API Hatası (ProductImage):', {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
        productId: resolvedIdeasoftProductId
      })

      const errorMessageFinal =
        apiError.response?.data?.errorMessage ||
        apiError.response?.data?.message ||
        apiError.response?.data?.error ||
        apiError.response?.data?.error_description ||
        apiError.message ||
        'ProductImages gönderilemedi'

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessageFinal,
          statusCode: apiError.response?.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: apiError.response?.status || 500 
        }
      )
    }
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.errorMessage ||
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'ProductImages gönderilemedi'

    console.error('❌ ProductImage endpoint hatası:', {
      errorMessage,
      status: error.response?.status,
      data: error.response?.data
    })

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        statusCode: error.response?.status
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.response?.status || 500 
      }
    )
  }
})

