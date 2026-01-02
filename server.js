// Development server - API proxy için
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = 3001

app.set('etag', false)

const normalizeSku = (sku) => String(sku ?? '').trim()

const extractIdeasoftListItems = (data) => {
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.products)) return data.products
  return []
}

const findProductInListBySku = (items, sku) => {
  const target = normalizeSku(sku)
  if (!target) return null
  for (const it of items) {
    const itSku = normalizeSku(it?.sku)
    if (itSku && itSku === target) return it
  }
  return null
}

const inferImageExtension = (contentType, url) => {
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

const escapeHtml = (value) => {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const normalizeDetailsToHtml = (value) => {
  const s = String(value ?? '').trim()
  if (!s) return ''
  // Eğer HTML'e benziyorsa dokunma
  if (/<\s*\/?\s*[a-z][\s\S]*>/i.test(s)) return s
  // Plain text -> basit HTML
  const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return ''
  return lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')
}

const buildIdeasoftHeaders = (accessToken) => ({
  'Authorization': `Bearer ${accessToken}`,
  'Accept': 'application/json'
})

const fetchIdeasoftProductDetailForProduct = async ({ shopId, accessToken, ideasoftProductId, sku }) => {
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
      const resp = await axios.get(baseUrl, { headers, params })
      const items = extractIdeasoftListItems(resp.data)
      const hitBySku = targetSku ? findProductInListBySku(items, targetSku) : null
      if (hitBySku) return hitBySku
      if (Number.isFinite(productId)) {
        const hit = items.find(it => Number(it?.product?.id) === productId)
        if (hit) return hit
      }
    } catch (_) {
      // ignore
    }
  }

  // Fallback: sayfalı tarama (bazı mağazalarda filter paramları çalışmayabiliyor)
  const pageParamVariants = [
    (page, limit) => ({ page, limit }),
    (page, limit) => ({ page, perPage: limit }),
    (page, limit) => ({ page, per_page: limit }),
    (page, limit) => ({ pageNumber: page, pageSize: limit })
  ]

  const limit = 100
  const maxPages = 10
  for (const buildParams of pageParamVariants) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const resp = await axios.get(baseUrl, { headers, params: buildParams(page, limit) })
        const items = extractIdeasoftListItems(resp.data)
        if (!items || items.length === 0) break
        const hitBySku = targetSku ? findProductInListBySku(items, targetSku) : null
        if (hitBySku) return hitBySku
        if (Number.isFinite(productId)) {
          const hit = items.find(it => Number(it?.product?.id) === productId)
          if (hit) return hit
        }
      } catch (_) {
        break
      }
    }
  }

  return null
}

const fetchIdeasoftProductImagesForProduct = async ({ shopId, accessToken, ideasoftProductId }) => {
  const headers = buildIdeasoftHeaders(accessToken)
  const baseUrl = `https://${shopId}.myideasoft.com/admin-api/product_images`
  const productId = Number(ideasoftProductId)

  const filterParamVariants = [
    Number.isFinite(productId) ? { productId } : null,
    Number.isFinite(productId) ? { product_id: productId } : null
  ].filter(Boolean)

  for (const params of filterParamVariants) {
    try {
      const resp = await axios.get(baseUrl, { headers, params })
      const items = extractIdeasoftListItems(resp.data)
      if (items && items.length) return items
    } catch (_) {
      // ignore
    }
  }

  // Fallback: sayfalı tarama
  const pageParamVariants = [
    (page, limit) => ({ page, limit }),
    (page, limit) => ({ page, perPage: limit }),
    (page, limit) => ({ page, per_page: limit }),
    (page, limit) => ({ pageNumber: page, pageSize: limit })
  ]

  const limit = 100
  const maxPages = 10
  for (const buildParams of pageParamVariants) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const resp = await axios.get(baseUrl, { headers, params: buildParams(page, limit) })
        const items = extractIdeasoftListItems(resp.data)
        if (!items || items.length === 0) break
        const filtered = items.filter(it => Number(it?.product?.id) === productId)
        if (filtered.length) return filtered
      } catch (_) {
        break
      }
    }
  }

  return []
}

const fetchIdeasoftProductBySku = async ({ shopId, accessToken, sku }) => {
  const targetSku = normalizeSku(sku)
  if (!targetSku) throw new Error('sku gerekli')

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
      const resp = await axios.get(baseUrl, { headers, params })
      const items = extractIdeasoftListItems(resp.data)
      const hit = findProductInListBySku(items, targetSku)
      if (hit) return hit
    } catch (_) {
      // ignore and fallback
    }
  }

  // Fallback: scan paginated lists (best-effort)
  const pageParamVariants = [
    (page, limit) => ({ page, limit }),
    (page, limit) => ({ page, perPage: limit }),
    (page, limit) => ({ page, per_page: limit }),
    (page, limit) => ({ pageNumber: page, pageSize: limit })
  ]

  const limit = 100
  const maxPages = 20

  for (const buildParams of pageParamVariants) {
    for (let page = 1; page <= maxPages; page++) {
      const params = buildParams(page, limit)
      try {
        const resp = await axios.get(baseUrl, { headers, params })
        const items = extractIdeasoftListItems(resp.data)
        const hit = findProductInListBySku(items, targetSku)
        if (hit) return hit
        if (!items || items.length === 0) break
      } catch (_) {
        break
      }
    }
  }

  return null
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin / curl / server-to-server
    if (!origin) return callback(null, true)

    // Allow localhost dev frontends (Vite can be 3000/5173/etc.)
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    if (isLocalhost) return callback(null, true)

    return callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}

app.use(cors(corsOptions))
app.use(express.json())

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    // Prevent conditional GETs from producing 304 responses for API calls
    // (stale cached batch data can cause UI to show products as deleted after refresh)
    delete req.headers['if-none-match']
    delete req.headers['if-modified-since']

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.setHeader('Surrogate-Control', 'no-store')
  }
  return next()
})

// Find Ideasoft product by SKU (best-effort)
app.all('/api/ideasoft/find-product-by-sku', async (req, res) => {
  try {
    const fromBody = req.body || {}
    const fromQuery = req.query || {}
    const shopId = fromBody.shopId || fromQuery.shopId
    const accessToken = fromBody.accessToken || fromQuery.accessToken
    const sku = fromBody.sku || fromQuery.sku

    if (!shopId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Shop ID ve Access Token gerekli' })
    }

    const found = await fetchIdeasoftProductBySku({ shopId, accessToken, sku })
    if (!found) {
      return res.status(404).json({ success: false, error: 'Ürün bulunamadı' })
    }

    return res.status(200).json({ success: true, data: found })
  } catch (error) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Ürün bulunamadı'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})

// ProductImages endpoint - Ürün görseli gönderme (URL -> download -> base64 -> upload)
app.post('/api/product-images', async (req, res) => {
  try {
    const { shopId, accessToken, localProductId, imageUrl, ideasoftProductId, imageId, filename, extension, sortOrder, thumbUrl, originalUrl, alt, attachment } = req.body || {}

    if (!shopId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Shop ID ve Access Token gerekli' })
    }
    if (!imageUrl && !attachment) {
      return res.status(400).json({ success: false, error: 'imageUrl veya attachment (base64) gerekli' })
    }
    if (!supabaseUrl || !supabaseServiceKey || !supabase) {
      return res.status(500).json({ success: false, error: 'Supabase bağlantısı yapılandırılmamış' })
    }

    let resolvedIdeasoftProductId = ideasoftProductId
    if (!resolvedIdeasoftProductId && localProductId) {
      const { data: rows, error: dbError } = await supabase
        .from('imported_products')
        .select('*')
        .eq('id', localProductId)
        .single()
      
      if (dbError) {
        throw new Error(`Ürün bulunamadı: ${dbError.message}`)
      }
            if (!rows) {
        return res.status(404).json({ success: false, error: 'Ürün bulunamadı' })
      }
      resolvedIdeasoftProductId = rows.ideasoft_product_id
    }
    if (!resolvedIdeasoftProductId) {
      return res.status(400).json({ success: false, error: 'ideasoftProductId gerekli (veya localProductId üzerinden DB\'de ideasoft_product_id olmalı)' })
    }

    let attachmentData = null
    let resolvedFilename = filename
    let resolvedExtension = extension

    // Eğer imageUrl varsa, resmi indir ve base64'e çevir
    if (imageUrl) {
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer' })
    const contentType = imgResp.headers?.['content-type']
      resolvedExtension = resolvedExtension || inferImageExtension(contentType, imageUrl)
      attachmentData = Buffer.from(imgResp.data).toString('base64')
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

    // API dokümantasyonuna uygun payload oluştur
    const payload = {
      id: imageId ? Number(imageId) : undefined, // Opsiyonel: güncelleme için
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

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/product_images`
    
    try {
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

      console.log('✅ ProductImage başarıyla gönderildi:', { productId: resolvedIdeasoftProductId, filename: resolvedFilename })
    return res.status(200).json({ success: true, data: response.data })
    } catch (apiError) {
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
                ? responseData.errors.map(e => e?.message || e?.error || e?.errorMessage).filter(Boolean).join(' | ')
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
        // Duplicate ise: mümkünse mevcut image kaydını bulup id ile update dene
        try {
          const images = await fetchIdeasoftProductImagesForProduct({
            shopId,
            accessToken,
            ideasoftProductId: resolvedIdeasoftProductId
          })
          const hit = images.find(it => String(it?.filename || '').toLowerCase() === String(payload.filename || '').toLowerCase())
            || images.find(it => Number(it?.sortOrder || it?.sort_order || 0) === Number(payload.sortOrder || 1))
            || images[0]
          if (hit?.id) {
            const updatePayload = { ...payload, id: Number(hit.id) }
            const updResp = await axios.post(apiUrl, updatePayload, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            })
            console.log('✅ ProductImage duplicate sonrası güncellendi:', { productId: resolvedIdeasoftProductId, filename: payload.filename, imageId: hit.id })
            return res.status(200).json({ success: true, data: updResp.data, updated: true })
          }
        } catch (e) {
          console.error('⚠️ ProductImage duplicate sonrası update denenemedi:', e?.message || e)
        }

        // Duplicate error'ı hata olarak döndür ama mesajı değiştir
        // SKU bilgisini almak için veritabanından çek
        let productSku = '';
        try {
          if (localProductId) {
            const { data: rows } = await supabase
              .from('imported_products')
              .select('sku')
              .eq('id', localProductId)
              .single()
            if (rows) {
              productSku = rows.sku || '';
            }
          }
        } catch (e) {
          console.error('SKU bilgisi alınamadı:', e)
        }

        console.log('❌ ProductImage duplicate hatası:', { productId: resolvedIdeasoftProductId, filename: resolvedFilename, sku: productSku })
        return res.status(400).json({
          success: false,
          error: 'Aynı üründen var',
          statusCode: 400,
          duplicate: true
        })
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

      return res.status(apiError.response?.status || 500).json({
        success: false,
        error: errorMessageFinal,
        statusCode: apiError.response?.status
      })
    }
  } catch (error) {
    const errorMessage =
      error.response?.data?.errorMessage ||
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'ProductImages gönderilemedi'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  return next()
})

app.post('/api/google/image-search', async (req, res) => {
  try {
    const apiKey = process.env.VITE_GOOGLE_API_KEY
    const cx = process.env.VITE_GOOGLE_SEARCH_ENGINE_ID

    if (!apiKey || !cx) {
      return res.status(400).json({ success: false, error: 'Google API Key veya Search Engine ID eksik (VITE_GOOGLE_API_KEY / VITE_GOOGLE_SEARCH_ENGINE_ID)' })
    }

    const { query } = req.body || {}
    const q = String(query || '').trim()
    if (!q) {
      return res.status(400).json({ success: false, error: 'query gerekli' })
    }

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q,
        searchType: 'image',
        num: 1,
        imgSize: 'large',
        imgType: 'photo',
        hl: 'tr',
        lr: 'lang_tr'
      }
    })

    const url = response?.data?.items?.[0]?.link || null
    return res.json({ success: true, url })
  } catch (error) {
    const status = error?.response?.status
    const errorData = error?.response?.data?.error || {}
    const errorMessage = errorData?.message || error?.message || 'Google image search hatası'
    
    // Quota exceeded kontrolü
    if (status === 429 || errorMessage.toLowerCase().includes('quota') || 
        errorMessage.toLowerCase().includes('limit exceeded') ||
        errorMessage.toLowerCase().includes('daily limit')) {
      return res.status(429).json({ 
        success: false, 
        error: 'Search engine hakkınız doldu. Lütfen Google API limitinizi kontrol edin veya daha sonra tekrar deneyin.',
        quotaExceeded: true
      })
    }
    
    return res.status(status || 500).json({ success: false, error: errorMessage })
  }
})

app.post('/api/google/web-search', async (req, res) => {
  try {
    const apiKey = process.env.VITE_GOOGLE_API_KEY
    const cx = process.env.VITE_GOOGLE_SEARCH_ENGINE_ID

    if (!apiKey || !cx) {
      return res.status(400).json({ success: false, error: 'Google API Key veya Search Engine ID eksik' })
    }

    const { query } = req.body || {}
    const q = String(query || '').trim()
    if (!q) {
      return res.status(400).json({ success: false, error: 'query gerekli' })
    }

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q,
        hl: 'tr',
        lr: 'lang_tr',
        num: 3 // İlk 3 sonucu getir
      }
    })

    const items = response?.data?.items || []
    return res.json({ success: true, items })
  } catch (error) {
    const status = error?.response?.status
    const errorData = error?.response?.data?.error || {}
    const errorMessage = errorData?.message || error?.message || 'Google web search hatası'
    
    // Quota exceeded kontrolü
    if (status === 429 || errorMessage.toLowerCase().includes('quota') || 
        errorMessage.toLowerCase().includes('limit exceeded') ||
        errorMessage.toLowerCase().includes('daily limit')) {
      return res.status(429).json({ 
        success: false, 
        error: 'Search engine hakkınız doldu. Lütfen Google API limitinizi kontrol edin veya daha sonra tekrar deneyin.',
        quotaExceeded: true
      })
    }
    
    return res.status(status || 500).json({ success: false, error: errorMessage })
  }
})

app.post('/api/google/format-description', async (req, res) => {
  try {
    const { productName, brand, searchResults } = req.body || {}
    
    if (!productName) {
      return res.status(400).json({ success: false, error: 'productName gerekli' })
    }
    
    // Özellik adları ve değerleri için regex desenlerini tanımla
    const propertyValuePatterns = [
      // Genel Özellikler
      { property: 'Klavye/Mouse Set', pattern: /klavye.*?set|mouse.*?set|set|bundle|paket|kit/i, valuePattern: /(evet|hayır|var|yok|set|paket|kit|comple|complete|full)/i },
      { property: 'Klavye Tipi', pattern: /klavye.*?tip|klavye.*?tür|klavye.*?model|klavye.*?çeşit|keyboard.*?type|type.*?keyboard/i, valuePattern: /(kablosuz|kablolu|wireless|wired|mekanik|membran|mechanical|membrane)/i },
      { property: 'Tuş Takımı', pattern: /tuş.*?takımı|tuş.*?dili|keyboard.*?layout|layout.*?keyboard|q.*?türkçe|türkçe.*?q|dil.*?tuş|language.*?keyboard/i, valuePattern: /(q\s*türkçe|türkçe|q.*?tr|tr.*?q|q\s*turkish|turkish|q\s*lang|ingilizce|english|qwertz|qwerty|abc)/i },
      { property: 'PC Bağlantı', pattern: /bağlantı|connection|interface|port|usb|konektör|konektor|giriş|input/i, valuePattern: /(usb|wireless|kablosuz|kablolu|bluetooth|2\.4g|2\.4ghz|rf)/i },
      { property: 'Tasarım', pattern: /tasarım|design|form.*?factor|şekil|tip|type|style/i, valuePattern: /(standart|mini|compact|full.*?size|gaming|ergonomik|ergonomic)/i },
      { property: 'Kablosuz Alıcı', pattern: /kablosuz.*?alıcı|wireless.*?receiver|usb.*?alıcı|dongle|usb.*?dongle/i, valuePattern: /(mini|standart|usb|wireless|kablosuz)/i },
      { property: 'Multimedya Tuşlar', pattern: /multimedya.*?tuş|medya.*?tuş|media.*?key|multimedia.*?key|fonksiyon.*?tuş|function.*?key/i, valuePattern: /(var|yok|evet|hayır|13|12|10|8|çok)/i },
      { property: 'Mouse İzleme', pattern: /fare.*?izleme|mouse.*?tracking|fare.*?sensör|mouse.*?sensor|optik|lazer/i, valuePattern: /(optik|lazer|laser|optical)/i },
      { property: 'Mikrofon', pattern: /mikrofon|microphone|voice|ses/i, valuePattern: /(var|yok|evet|hayır|built.*?in|dahili|harici|external)/i },
      { property: 'Tipi', pattern: /tipi|türü|type|model|çeşit|kind/i, valuePattern: /(kafa.*?bant|kulak.*?üstü|ear.*?over|kulak.*?iç|ear.*?in|kablolu|kablosuz|gaming|pro)/i },
      { property: 'Bağlantı', pattern: /bağlantı|connection|interface|konektör/i, valuePattern: /(usb|jack|3\.5mm|wireless|kablosuz|bluetooth)/i },
      { property: 'Özel Sayfalar', pattern: /gaming|oyun|pro|professional|gamer|esports|oyuncu/i, valuePattern: /(gaming|oyun|pro|professional|esports|gamer)/i },
      { property: 'Renk', pattern: /renk|color|colour/i, valuePattern: /([a-zıöçşüğ]+)/i },
      { property: 'Pil Ömrü', pattern: /pil.*?ömür|battery.*?life|ömür.*?pil/i, valuePattern: /([0-9]+\s*(ay|month|gün|day|saat|hour))/i },
    ];
    
    // Özellikleri çıkarmak için searchResults'ı analiz et
    const properties = {};
    
    if (searchResults && Array.isArray(searchResults)) {
      for (const result of searchResults) {
        const text = `${result.title || ''} ${result.snippet || ''}`.toLowerCase();
        
        for (const propPattern of propertyValuePatterns) {
          if (propPattern.pattern.test(text)) {
            // Değer desenini bul
            const valueMatch = text.match(propPattern.valuePattern);
            if (valueMatch && valueMatch[0]) {
              const value = valueMatch[0].trim();
              if (value && !properties[propPattern.property]) {
                properties[propPattern.property] = value.charAt(0).toUpperCase() + value.slice(1);
              }
            }
            
            // Eğer değer bulunamazsa, genel bağlamdan değer çıkar
            if (!properties[propPattern.property]) {
              // Basitçe ilgili kavramdan sonraki kelimeyi al
              const generalMatch = text.match(new RegExp(`${propPattern.pattern.source}.*?([a-zıöçşüğ0-9\s]+?)(?:\.|,|;|\s+ve|\s+ile|\s+or|\s+and|$)`, 'i'));
              if (generalMatch && generalMatch[1]) {
                let value = generalMatch[1].trim();
                // Sadece ilk 2 kelimeyi al
                value = value.split(' ').slice(0, 2).join(' ');
                if (value && !properties[propPattern.property]) {
                  properties[propPattern.property] = value.charAt(0).toUpperCase() + value.slice(1);
                }
              }
            }
          }
        }
      }
    }
    
    // Özellik tablosunu HTML olarak oluştur
    let propertyTable = '';
    if (Object.keys(properties).length > 0) {
      propertyTable = '<table class="prop-tab" style="border-collapse: collapse; border-spacing: 0px; background-color: #ffffff; margin-bottom: 25px; width: 820px; font-size: 13px; color: #666a6c; font-family: InterVariable, Helvetica, Arial, sans-serif;">';
      propertyTable += '<tbody style="box-sizing: border-box;">';
      
      let rowClass = '';
      for (const [prop, value] of Object.entries(properties)) {
        propertyTable += `<tr style="box-sizing: border-box;">
          <td class="title" style="box-sizing: border-box; padding: 10px 25px; border-width: 0px 0px 1px; border-image: initial; width: 249px; color: #000000; border-color: initial initial #ececec initial; border-style: initial initial solid initial;${rowClass ? ' background-color: #fafafa;' : ''}" width="249">${prop}</td>
          <td style="box-sizing: border-box; padding: 10px 25px; border-width: 0px 0px 1px 1px; border-image: initial; border-color: initial initial #ececec #ececec; border-style: initial initial solid solid;${rowClass ? ' background-color: #fafafa;' : ''}">${value}</td>
        </tr>`;
        rowClass = rowClass ? '' : ' background-color: #fafafa;';
      }
      
      propertyTable += '</tbody></table>';
    }
    
    // Açıklama metnini oluştur
    let descriptionText = '';
    if (searchResults && searchResults.length > 0) {
      descriptionText = searchResults
        .map(r => `<p style="box-sizing: border-box; margin: 0px 0px 11px; color: #666a6c; font-family: InterVariable, Helvetica, Arial, sans-serif; font-size: 13px; background-color: #ffffff; outline: none !important;">${r.title ? '<strong>' + r.title + '</strong>: ' : ''}${r.snippet || ''}</p>`)
        .join('\n');
    }
    
    const formattedDescription = propertyTable + '\n' + descriptionText;
    
    return res.json({ success: true, description: formattedDescription });
  } catch (error) {
    console.error('Format description error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
})

app.all('/api/ideasoft/get-product', async (req, res) => {
  try {
    const fromBody = req.body || {}
    const fromQuery = req.query || {}
    const shopId = fromBody.shopId || fromQuery.shopId
    const accessToken = fromBody.accessToken || fromQuery.accessToken
    const productId = fromBody.productId || fromQuery.productId

    if (!shopId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Shop ID ve Access Token gerekli' })
    }
    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId gerekli' })
    }

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products/${productId}`
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    return res.status(200).json({ success: true, data: response.data })
  } catch (error) {
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Ideasoft ürün bilgisi alınamadı'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})

app.post('/api/ideasoft/get-products-batch', async (req, res) => {
  try {
    const { shopId, accessToken, productIds } = req.body || {}

    if (!shopId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Shop ID ve Access Token gerekli' })
    }
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, error: 'productIds array gerekli' })
    }

    const uniqueIds = [...new Set(productIds.map(x => String(x).trim()).filter(Boolean))].slice(0, 50)
    const results = {}

    for (const id of uniqueIds) {
      try {
        const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products/${id}`
        const response = await axios.get(apiUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })
        results[id] = { success: true, data: response.data }
      } catch (e) {
        const msg = e.response?.data?.message || e.response?.data?.error || e.message || 'Ürün alınamadı'
        results[id] = { success: false, error: msg, statusCode: e.response?.status }
      }
    }

    return res.status(200).json({ success: true, data: { results } })
  } catch (error) {
    const errorMessage = error.message || 'Toplu ürün çekme hatası'
    return res.status(500).json({ success: false, error: errorMessage })
  }
})

app.put('/api/ideasoft/products/:id', async (req, res) => {
  try {
    const { shopId, accessToken, productData } = req.body || {}
    const productId = req.params.id

    if (!shopId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Shop ID ve Access Token gerekli' })
    }

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products/${productId}`
    const response = await axios.put(apiUrl, productData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    return res.status(200).json({ success: true, data: response.data })
  } catch (error) {
    console.error('Ideasoft Update Error:', error.response?.data || error.message)
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Ideasoft ürün güncellenemedi'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})



// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Development server is running' })
})

// Generate product description - Moved to Supabase Edge Function: gemini-generate-description
// Validate Gemini API Key - Moved to Supabase Edge Function: gemini-validate-key
// OAuth2 token exchange - Moved to Supabase Edge Function: ideasoft-exchange-token
// Categories endpoint - Moved to Supabase Edge Function: ideasoft-categories
// ProductDetail endpoint - Moved to Supabase Edge Function: ideasoft-product-details

// Products endpoint - Moved to Supabase Edge Function: ideasoft-products

// Endpoint to recreate a deleted product
app.post('/api/recreate-deleted-product', async (req, res) => {
  try {
    const { shopId, accessToken, product } = req.body

    if (!shopId || !accessToken || !product) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID, Access Token ve Product gerekli'
      })
    }

    // Ideasoft API formatına göre ürün objesi oluştur
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

    const response = await axios.post(apiUrl, ideasoftProduct, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    return res.status(200).json({
      success: true,
      data: response.data
    })
  } catch (error) {
    console.error('Recreate Deleted Product API Error:', error)

    const isDuplicate =
      error?.response?.status === 400 &&
      (String(error?.response?.data?.errorMessage || '').toLowerCase().includes('duplicate') ||
        String(error?.response?.data?.errorMessage || '').toLowerCase().includes('entry'))

    if (isDuplicate) {
      try {
        const sku = product?.sku
        const found = await fetchIdeasoftProductBySku({ shopId, accessToken, sku })
        if (found?.id) {
          return res.status(200).json({ success: true, data: found, alreadyExists: true })
        }
      } catch (e) {
        console.error('Duplicate fallback SKU lookup failed:', e)
      }
    }

    const errorMessage =
      error.response?.data?.errorMessage ||
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Ürün yeniden oluşturulamadı'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})

// Product-to-Categories endpoint - Moved to Supabase Edge Function: ideasoft-product-to-categories




app.listen(PORT, () => {
  console.log(`🚀 Development API server running on http://localhost:${PORT}`)
  console.log('📡 Remaining API endpoints:')
  console.log('   - /api/health (Health check)')
  console.log('   - /api/google/* (Google Search API - local development only)')
  console.log('   - /api/ideasoft/* (Ideasoft helper endpoints - local development only)')
  console.log('')
  console.log('💡 All Ideasoft, Gemini, and Database operations are handled by Supabase Edge Functions')
  console.log('💡 Frontend should use VITE_SUPABASE_URL for production')
})