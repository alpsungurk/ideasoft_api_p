// Development server - API proxy için
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

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
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Veritabanı bağlantısı yok' })
    }

    let resolvedIdeasoftProductId = ideasoftProductId
    if (!resolvedIdeasoftProductId && localProductId) {
      const [rows] = await pool.query('SELECT * FROM imported_products WHERE id = ? LIMIT 1', [localProductId])
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Ürün bulunamadı' })
      }
      resolvedIdeasoftProductId = rows[0].ideasoft_product_id
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
            const [rows] = await pool.query('SELECT sku FROM imported_products WHERE id = ? LIMIT 1', [localProductId])
            if (rows && rows.length > 0) {
              productSku = rows[0].sku || '';
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


// Update imported product fields (Project detail edit)
app.patch('/api/db/imported-products/:id', async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, error: 'No DB connection' })

    const id = req.params.id
    const {
      description,
      imageUrl,
      status,
      name,
      sku,
      price,
      stockAmount,
      categoryId,
      ideasoft_product_id,
      ideasoftProductId
    } = req.body || {}

    const fields = []
    const values = []

    if (description !== undefined) {
      fields.push('description = ?')
      values.push(String(description))
    }

    if (imageUrl !== undefined) {
      fields.push('image_url = ?')
      values.push(String(imageUrl))
    }

    if (status !== undefined) {
      fields.push('status = ?')
      values.push(Number(status) === 1 ? 1 : 0)
    }

    if (name !== undefined) {
      fields.push('name = ?')
      values.push(String(name))
    }

    if (sku !== undefined) {
      fields.push('sku = ?')
      values.push(String(sku))
    }

    if (price !== undefined) {
      fields.push('price = ?')
      values.push(Number(price) || 0)
    }

    if (stockAmount !== undefined) {
      fields.push('stock_amount = ?')
      values.push(Number(stockAmount) || 0)
    }

    if (categoryId !== undefined) {
      fields.push('selected_category_id = ?')
      values.push(categoryId === null || categoryId === '' ? null : Number(categoryId))
    }

    const incomingIdeasoftId = ideasoft_product_id !== undefined ? ideasoft_product_id : ideasoftProductId
    if (incomingIdeasoftId !== undefined) {
      fields.push('ideasoft_product_id = ?')
      values.push(incomingIdeasoftId === null || incomingIdeasoftId === '' ? null : Number(incomingIdeasoftId))
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'Güncellenecek alan yok' })
    }

    values.push(id)
    const query = `UPDATE imported_products SET ${fields.join(', ')} WHERE id = ?`
    const [result] = await pool.query(query, values)
    return res.json({ success: true, affected: result.affectedRows })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
})

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Development server is running' })
})

// Generate product description using Gemini API
app.post('/api/generate-product-description', async (req, res) => {
  try {
    const { productName, brand, features } = req.body || {}
    
    // Validate required parameters
    if (!productName) {
      return res.status(400).json({ 
        success: false, 
        error: 'productName gerekli' 
      })
    }
    
    // Get Gemini API key from request body only
    const geminiApiKey = req.body?.geminiApiKey
    
    if (!geminiApiKey || !geminiApiKey.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Gemini API Key gerekli' 
      })
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

Lütfen ürünle ilgili tüm teknik özellikleri ve bilgileri tabloya uygun şekilde yerleştirin.`;
    
    // Call Gemini API directly using axios
    const geminiUrl = `https://generativelanguage.googleapis.com/${process.env.VITE_GEMINI_API_VERSION || 'v1'}/models/${process.env.VITE_GEMINI_MODEL || 'gemini-pro'}:generateContent?key=${geminiApiKey}`;
    
    const geminiResponse = await axios.post(geminiUrl, {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    // Extract the generated description from response
    const description = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!description) {
      return res.status(500).json({ 
        success: false, 
        error: 'Ürün açıklaması oluşturulamadı' 
      })
    }
    
    return res.json({ 
      success: true, 
      description: description 
    });
    
  } catch (error) {
    console.error('Gemini API Error:', error.message || error);
    
    // Check if it's an axios error (from Gemini API call)
    if (error.response) {
      // Axios error - Gemini API returned an error
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        return res.status(400).json({ 
          success: false, 
          error: 'Geçersiz istek: ' + (data?.error?.message || error.message || 'Parametreler eksik veya hatalı') 
        });
      } else if (status === 403) {
        return res.status(403).json({ 
          success: false, 
          error: 'API anahtarı geçersiz veya erişim reddedildi: ' + (data?.error?.message || 'Yetkilendirme hatası') 
        });
      } else if (status === 429) {
        const errorMsg = data?.error?.message || '';
        const isQuotaExceeded = errorMsg.toLowerCase().includes('quota') || 
                                errorMsg.toLowerCase().includes('limit') ||
                                errorMsg.toLowerCase().includes('exceeded');
        return res.status(429).json({ 
          success: false, 
          error: isQuotaExceeded ? 'Gemini API keyi bitti. Lütfen yeni bir API key alın veya limitinizi kontrol edin.' : 'API kullanım limitine ulaşıldı, lütfen daha sonra tekrar deneyin',
          quotaExceeded: true
        });
      } else {
        return res.status(status || 500).json({ 
          success: false, 
          error: data?.error?.message || error.message || 'Gemini API hatası' 
        });
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error('No response received from Gemini API:', error.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API ile iletişim kurulamadı: ' + error.message 
      });
    } else {
      // Other errors
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Ürün açıklaması oluşturulurken bir hata oluştu' 
      });
    }
  }
})

// Validate Gemini API Key
app.post('/api/validate-gemini-key', async (req, res) => {
  try {
    const { geminiApiKey } = req.body || {}
    
    if (!geminiApiKey || !geminiApiKey.trim()) {
      return res.status(400).json({ 
        valid: false,
        message: 'API Key gerekli' 
      })
    }
    
    const trimmedKey = geminiApiKey.trim()
    
    // Test isteği gönder - basit bir prompt ile
    const testPrompt = 'Hello'
    const apiVersion = process.env.VITE_GEMINI_API_VERSION || 'v1'
    const model = process.env.VITE_GEMINI_MODEL || 'gemini-pro'
    const geminiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${trimmedKey}`
    
    try {
      const testResponse = await axios.post(geminiUrl, {
        contents: [{
          parts: [{
            text: testPrompt
          }]
        }]
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000 // 15 second timeout for validation
      })
      
      // Response yapısını kontrol et
      const hasValidResponse = testResponse.data && 
                                testResponse.data.candidates && 
                                Array.isArray(testResponse.data.candidates) && 
                                testResponse.data.candidates.length > 0 &&
                                testResponse.data.candidates[0].content &&
                                testResponse.data.candidates[0].content.parts
      
      if (hasValidResponse) {
        return res.json({ 
          valid: true,
          message: 'API Key geçerli' 
        })
      } else {
        return res.json({ 
          valid: false,
          message: 'API Key geçerli değil - Geçersiz yanıt formatı' 
        })
      }
    } catch (apiError) {
      // API hatası kontrolü
      if (apiError.response) {
        const status = apiError.response.status
        const data = apiError.response.data
        const errorMessage = data?.error?.message || data?.error || 'Bilinmeyen hata'
        
        if (status === 400) {
          return res.json({ 
            valid: false,
            message: `API Key geçersiz: ${errorMessage}` 
          })
        } else if (status === 403) {
          return res.json({ 
            valid: false,
            message: `API Key yetkisiz veya erişim reddedildi: ${errorMessage}` 
          })
        } else if (status === 404) {
          return res.json({ 
            valid: false,
            message: `Model bulunamadı. Lütfen model adını kontrol edin: ${model}` 
          })
        } else if (status === 429) {
          const errorMsg = data?.error?.message || '';
          const isQuotaExceeded = errorMsg.toLowerCase().includes('quota') || 
                                  errorMsg.toLowerCase().includes('limit') ||
                                  errorMsg.toLowerCase().includes('exceeded');
          return res.json({ 
            valid: false,
            message: isQuotaExceeded ? 'Gemini API keyi bitti. Lütfen yeni bir API key alın veya limitinizi kontrol edin.' : 'API kullanım limitine ulaşıldı, lütfen daha sonra tekrar deneyin'
          })
        } else {
          return res.json({ 
            valid: false,
            message: `API Key doğrulanamadı (${status}): ${errorMessage}` 
          })
        }
      } else if (apiError.request) {
        // İstek gönderildi ama yanıt alınamadı
        return res.json({ 
          valid: false,
          message: 'Gemini API\'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.' 
        })
      } else {
        // Diğer hatalar
        return res.json({ 
          valid: false,
          message: `API Key doğrulanamadı: ${apiError.message || 'Bilinmeyen hata'}` 
        })
      }
    }
  } catch (error) {
    return res.status(500).json({ 
      valid: false,
      message: `Doğrulama hatası: ${error.message || 'Bilinmeyen hata'}` 
    })
  }
})

// OAuth2 token exchange endpoint
app.post('/api/exchange-token', async (req, res) => {
  try {
    const { code, shopId, clientId, clientSecret, redirectUri } = req.body

    if (!code || !shopId || !clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({
        error: 'Code, Shop ID, Client ID, Client Secret ve Redirect URI gerekli'
      })
    }

    const response = await axios.post(
      `https://${shopId}.myideasoft.com/oauth/v2/token`,
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    )

    return res.status(200).json({
      success: true,
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type,
      scope: response.data.scope
    })
  } catch (error) {
    console.error('❌ Token alma hatası:', error.message)
    if (error.response) {
      console.error('Error details:', {
        status: error.response.status,
        data: error.response.data
      })
    }

    let errorMessage = error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Token alınamadı'

    // Daha açıklayıcı hata mesajları
    if (error.response?.data?.error === 'invalid_grant') {
      if (error.response?.data?.error_description?.includes("Code doesn't exist")) {
        errorMessage = 'Authorization code geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.'
      } else {
        errorMessage = 'Authorization code hatası: ' + (error.response?.data?.error_description || 'Geçersiz kod')
      }
    } else if (error.response?.data?.error === 'invalid_client') {
      errorMessage = 'Client ID veya Client Secret hatalı. Lütfen kontrol edin.'
    } else if (error.response?.data?.error === 'redirect_uri_mismatch') {
      errorMessage = 'Redirect URI eşleşmiyor. Ideasoft panelinde kayıtlı Redirect URI ile eşleştiğinden emin olun.'
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      errorCode: error.response?.data?.error,
      errorDetails: error.response?.data
    })
  }
})

// Categories endpoint
app.get('/api/categories', async (req, res) => {
  try {
    const { shopId, accessToken, categoryId } = req.query

    if (!shopId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID ve Access Token gerekli'
      })
    }

    let apiUrl
    if (categoryId) {
      // Tek kategori getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories/${categoryId}`
    } else {
      // Tüm kategorileri getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories`
    }

    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    // Response data'yı kontrol et
    let categoriesList = []
    if (categoryId) {
      // Tek kategori döndür
      return res.status(200).json({
        success: true,
        data: response.data
      })
    } else {
      // Tüm kategoriler
      if (Array.isArray(response.data)) {
        categoriesList = response.data
      } else if (response.data && Array.isArray(response.data.items)) {
        categoriesList = response.data.items
      } else if (response.data && Array.isArray(response.data.categories)) {
        categoriesList = response.data.categories
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        categoriesList = response.data.data
      }

      // Status 1 olanları filtrele (1 = Aktif)
      const activeCategories = categoriesList.filter(cat => cat.status === 1)

      // Parent name'leri de ekle
      const categoriesWithParent = activeCategories.map(cat => ({
        ...cat,
        parentName: cat.parent?.name || null,
        parentId: cat.parent?.id || null
      }))

      return res.status(200).json({
        success: true,
        data: categoriesWithParent,
        total: categoriesList.length,
        active: activeCategories.length
      })
    }
  } catch (error) {
    console.error('Categories API Error:', error)
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Kategoriler alınamadı'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})

// ProductDetail endpoint - Ürün açıklaması/detay gönderme
app.post('/api/product-details', async (req, res) => {
  try {
    const { shopId, accessToken, localProductId, details, extraDetails, productDetailId } = req.body || {}

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
      return res.status(400).json({ success: false, error: 'Shop ID gerekli', received: { shopId } })
    }
    if (!accessToken) {
      console.error('❌ ProductDetail: Access Token eksik')
      return res.status(400).json({ success: false, error: 'Access Token gerekli', received: { accessToken: accessToken ? '***' : undefined } })
    }
    if (!localProductId) {
      console.error('❌ ProductDetail: localProductId eksik', { body: req.body })
      return res.status(400).json({ 
        success: false, 
        error: 'localProductId gerekli', 
        received: { localProductId },
        body: Object.keys(req.body || {})
      })
    }
    if (!pool) {
      console.error('❌ ProductDetail: Veritabanı bağlantısı yok')
      return res.status(500).json({ success: false, error: 'Veritabanı bağlantısı yok' })
    }

    // localProductId'yi number'a çevir
    const productId = Number(localProductId)
    if (isNaN(productId)) {
      console.error('❌ ProductDetail: localProductId geçersiz', { localProductId, type: typeof localProductId })
      return res.status(400).json({ 
        success: false, 
        error: 'localProductId geçerli bir sayı olmalı', 
        received: localProductId,
        type: typeof localProductId
      })
    }

    const [rows] = await pool.query('SELECT * FROM imported_products WHERE id = ? LIMIT 1', [productId])
    if (!rows || rows.length === 0) {
      console.error('❌ ProductDetail: Ürün bulunamadı', { productId })
      return res.status(404).json({ 
        success: false, 
        error: `Ürün bulunamadı (ID: ${productId})` 
      })
    }

    const p = rows[0]
    const ideasoftProductId = p.ideasoft_product_id
    if (!ideasoftProductId) {
      console.error('❌ ProductDetail: ideasoft_product_id yok', { productId, sku: p.sku })
      return res.status(400).json({ success: false, error: 'Bu ürün henüz Ideasoft\'a aktarılmamış (ideasoft_product_id yok).' })
    }

    const sku = String(p.sku || '').trim()
    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU boş olamaz' })
    }

    // API dokümantasyonuna uygun payload oluştur
    const payload = {
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

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/product_details`
    
    try {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })

      console.log('✅ ProductDetail başarıyla gönderildi:', { productId: ideasoftProductId, sku })
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
        // Duplicate ise: mevcut detail kaydını bulup id ile update dene
        try {
          const existing = await fetchIdeasoftProductDetailForProduct({
            shopId,
            accessToken,
            ideasoftProductId,
            sku
          })
          if (existing?.id) {
            const updatePayload = { ...payload, id: Number(existing.id) }
            const updResp = await axios.post(apiUrl, updatePayload, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            })
            console.log('✅ ProductDetail duplicate sonrası güncellendi:', { productId: ideasoftProductId, sku, productDetailId: existing.id })
            return res.status(200).json({ success: true, data: updResp.data, updated: true })
          }
        } catch (e) {
          console.error('⚠️ ProductDetail duplicate sonrası update denenemedi:', e?.message || e)
        }

        // Duplicate error'ı hata olarak döndür ama mesajı değiştir
        console.log('❌ ProductDetail duplicate hatası:', { productId: ideasoftProductId, sku })
        return res.status(400).json({
          success: false,
          error: 'Aynı üründen var',
          statusCode: 400,
          duplicate: true
        })
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
  } catch (error) {
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

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status,
      details: error.response?.data
    })
  }
})

// Products endpoint - Ürün oluşturma
app.post('/api/products', async (req, res) => {
  try {
    const { shopId, accessToken, product } = req.body

    if (!shopId || !accessToken || !product) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID, Access Token ve Product gerekli'
      })
    }

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
    console.error('Products API Error:', error)

    const responseData = error?.response?.data
    const errorMessage = (
      typeof responseData === 'string'
        ? responseData
        : [
            responseData?.message,
            responseData?.error,
            responseData?.errorMessage,
            responseData?.error_description,
            Array.isArray(responseData?.errors)
              ? responseData.errors
                  .map(e => e?.message || e?.error || e?.errorMessage)
                  .filter(Boolean)
                  .join(' | ')
              : undefined,
            responseData ? JSON.stringify(responseData) : undefined,
            error?.message
          ]
            .filter(Boolean)
            .join(' ')
    ).toLowerCase()

    const isDuplicate =
      error?.response?.status === 400 &&
      (errorMessage.includes('duplicate') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('zaten var') ||
        errorMessage.includes('entry'))

    if (isDuplicate) {
      try {
        const sku = req.body?.product?.sku
        const found = await fetchIdeasoftProductBySku({ shopId, accessToken, sku })
        if (found?.id) {
          return res.status(200).json({ success: true, data: found, alreadyExists: true })
        }
      } catch (e) {
        console.error('Duplicate fallback SKU lookup failed:', e)
      }
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage || 'Ürün oluşturulamadı',
      statusCode: error.response?.status,
      details: responseData
    })
  }
})

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

// Product-to-Categories endpoint - Ürün-kategori ilişkisi oluşturma
app.post('/api/product-to-categories', async (req, res) => {
  try {
    const { shopId, accessToken, productId, categoryId, productData } = req.body

    if (!shopId || !accessToken || !productId || !categoryId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID, Access Token, Product ID ve Category ID gerekli'
      })
    }

    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories`

    const productCategoryData = {
      product: {
        id: productId,
        name: productData?.name || '',
        fullName: productData?.fullName || productData?.name || '',
        sku: productData?.sku || '',
        stockAmount: productData?.stock || productData?.stockAmount || 0.0,
        price1: productData?.price || productData?.price1 || 0,
        currency: {
          id: 1
        },
        status: productData?.status !== undefined ? productData.status : 0
      },
      category: {
        id: categoryId
      }
    }

    const response = await axios.post(apiUrl, productCategoryData, {
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
    console.error('Product Category API Error:', error)
    const errorMessage = error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.error_description ||
      error.message ||
      'Kategori ilişkisi oluşturulamadı'

    return res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      statusCode: error.response?.status
    })
  }
})


// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ideasoft_api_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 60000, // 60 saniye
  acquireTimeout: 60000, // 60 saniye
  timeout: 60000, // 60 saniye
  reconnect: true
}

let pool = null;

async function initDb() {
  try {
    pool = mysql.createPool(dbConfig)
    const connection = await pool.getConnection()

    try {
      console.log('✅ MySQL Database Connected Successfully to ' + dbConfig.host)

      // Create tables if they don't exist
      await connection.query(`
        CREATE TABLE IF NOT EXISTS import_batches (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT 'PROCESSING',
            total_products INT DEFAULT 0,
            successful_products INT DEFAULT 0,
            failed_products INT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `)

      await connection.query(`
        CREATE TABLE IF NOT EXISTS imported_products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            batch_id INT NOT NULL,
            sku VARCHAR(100) NOT NULL,
            manufacturer_code VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10, 2) DEFAULT 0.00,
            stock_amount INT DEFAULT 0,
            description TEXT,
            image_url TEXT,
            brand VARCHAR(100),
            category_xml_name VARCHAR(255),
            selected_category_id INT,
            ideasoft_category_name VARCHAR(255),
            ideasoft_product_id INT,
            ideasoft_product_variant_id INT,
            status TINYINT DEFAULT 0,
            transfer_status CHAR(20) DEFAULT 'PENDING',
            transfer_error TEXT,
            last_transfer_date TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
            INDEX idx_sku (sku),
            INDEX idx_batch (batch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `)

      console.log('✅ Database tables checked/created successfully')
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('❌ Database Connection Failed:', error.message)
    console.log('💡 Lütfen veritabanı ayarlarını kontrol edin.')
  }
}

initDb()

// Create new batch and save products
app.post('/api/db/create-batch', async (req, res) => {
  try {
    const { products, projectName } = req.body

    if (!pool) return res.status(500).json({ success: false, error: 'Veritabanı bağlantısı yok' })
    if (!products || products.length === 0) return res.status(400).json({ success: false, error: 'Ürün listesi boş' })
    if (!projectName) return res.status(400).json({ success: false, error: 'Proje ismi gerekli' })

    // Aynı SKU kontrolü (aynı SKU'lar ileride status güncellemelerinde birbirini ezer)
    const skuCounts = new Map()
    for (const p of products) {
      const sku = String(p?.sku || '').trim()
      if (!sku) continue
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1)
    }
    const duplicateSkus = [...skuCounts.entries()].filter(([, c]) => c > 1).map(([sku]) => sku)
    if (duplicateSkus.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Aynı SKU'dan ürünler var: ${duplicateSkus.join(', ')}. Lütfen Excel dosyanızı kontrol edip tekilleştirin.`,
        duplicateSkus
      })
    }

    const connection = await pool.getConnection()

    try {
      await connection.beginTransaction()

      // 1. Batch oluştur
      const [batchResult] = await connection.query(
        'INSERT INTO import_batches (name, total_products, status) VALUES (?, ?, ?)',
        [projectName, products.length, 'PROCESSING']
      )
      const batchId = batchResult.insertId

      // 2. Ürünleri ekle
      const query = `
        INSERT INTO imported_products 
        (batch_id, sku, manufacturer_code, name, price, stock_amount, description, image_url, brand, category_xml_name, selected_category_id, ideasoft_category_name, status, transfer_status) 
        VALUES ?
      `

      // Map products
      const values = products.map(p => [
        batchId,
        String(p.sku || '').trim(),
        String(p.manufacturerCode || p.manufacturer_code || '').trim(),
        String(p.name || '').trim(),
        Number(p.price ?? p.price1 ?? 0) || 0,
        Number(p.stock ?? p.stockAmount ?? p.stock_amount ?? 0) || 0,
        String(p.description || '').trim(),
        String(p.image || p.imageUrl || p.image_url || '').trim(),
        String(p.brand || '').trim(),
        String(p.category || p.category_xml_name || '').trim(),
        (p.categoryId === undefined || p.categoryId === null || p.categoryId === '')
          ? null
          : Number(p.categoryId),
        (p.categoryName === undefined || p.categoryName === null || p.categoryName === '')
          ? null
          : String(p.categoryName),
        0,
        'PENDING'
      ])

      await connection.query(query, [values])

      await connection.commit()

      return res.status(200).json({
        success: true,
        message: 'Proje oluşturuldu',
        batchId: batchId
      })

    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error('Batch Create Error:', error)
    const msg = error?.sqlMessage || error?.message || 'Batch create failed'
    return res.status(500).json({
      success: false,
      error: msg,
      code: error?.code,
      errno: error?.errno
    })
  }
})

// Get all batches
app.get('/api/db/batches', async (req, res) => {
  let connection = null;
  try {
    if (!pool) return res.status(500).json({ success: false, error: 'No DB connection' })

    // Connection pool'dan bağlantı al
    connection = await pool.getConnection();
    
    const [rows] = await connection.query({
      sql: 'SELECT * FROM import_batches ORDER BY created_at DESC',
      timeout: 30000 // 30 saniye timeout
    })
    
    return res.json({ success: true, data: rows })
  } catch (error) {
    console.error('Get Batches Error:', error)
    
    // ECONNRESET ve connection hatalarını yakala
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ETIMEDOUT') {
      return res.status(500).json({ 
        success: false, 
        error: 'Veritabanı bağlantısı kesildi. Lütfen sayfayı yenileyin ve tekrar deneyin.' 
      })
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Veritabanı hatası oluştu' 
    })
  } finally {
    // Bağlantıyı her zaman release et
    if (connection) {
      connection.release();
    }
  }
})

// Get batch details with products
app.get('/api/db/batches/:id', async (req, res) => {
  let connection = null;
  try {
    if (!pool) return res.status(500).json({ success: false, error: 'No DB connection' })

    const batchId = parseInt(req.params.id, 10)
    if (isNaN(batchId)) {
      return res.status(400).json({ success: false, error: 'Invalid batch ID' })
    }

    // Connection pool'dan bağlantı al
    connection = await pool.getConnection();
    
    // Batch info
    const [batchRows] = await connection.query({
      sql: 'SELECT * FROM import_batches WHERE id = ?',
      timeout: 30000 // 30 saniye timeout
    }, [batchId])
    
    if (batchRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proje bulunamadı' })
    }

    // Products
    const [productRows] = await connection.query({
      sql: 'SELECT * FROM imported_products WHERE batch_id = ?',
      timeout: 30000 // 30 saniye timeout
    }, [batchId])

    return res.json({
      success: true,
      data: {
        ...batchRows[0],
        products: productRows
      }
    })
  } catch (error) {
    console.error('Get Batch Details Error:', error)
    
    // ECONNRESET ve connection hatalarını yakala
    if (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ETIMEDOUT') {
      return res.status(500).json({ 
        success: false, 
        error: 'Veritabanı bağlantısı kesildi. Lütfen sayfayı yenileyin ve tekrar deneyin.' 
      })
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Veritabanı hatası oluştu' 
    })
  } finally {
    // Bağlantıyı her zaman release et
    if (connection) {
      connection.release();
    }
  }
})

// Update Batch Status (Counters)
app.post('/api/db/update-batch-stats', async (req, res) => {
  try {
    const { batchId } = req.body
    if (!pool) return res.status(500).json({ success: false, error: 'No DB connection' })

    const connection = await pool.getConnection()
    try {
      // Calculate stats
      const [stats] = await connection.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN transfer_status = 'SUCCESS' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN transfer_status = 'FAILED' THEN 1 ELSE 0 END) as failed
        FROM imported_products WHERE batch_id = ?
      `, [batchId])

      const { total, successful, failed } = stats[0]
      const status = (successful + failed) >= total ? 'COMPLETED' : 'PROCESSING'

      await connection.query(`
        UPDATE import_batches 
        SET total_products = ?, successful_products = ?, failed_products = ?, status = ?
        WHERE id = ?
      `, [total, successful, failed, status, batchId])

      return res.json({ success: true })
    } finally {
      connection.release()
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})


// Update Ideasoft Status
app.post('/api/db/update-status', async (req, res) => {
  try {
    const { sku, ideasoftId, status, error } = req.body

    if (!pool) {
      return res.status(500).json({ success: false, error: 'Database not connected' })
    }

    const query = `
      UPDATE imported_products 
      SET 
        ideasoft_product_id = ?,
        transfer_status = ?,
        transfer_error = ?,
        last_transfer_date = IF(? = 'SUCCESS', NOW(), last_transfer_date)
      WHERE sku = ?
    `

    const [result] = await pool.query(query, [
      ideasoftId || null,
      status || 'PENDING',
      error || null,
      status || 'PENDING',
      sku
    ])

    return res.json({ success: true, affected: result.affectedRows })

  } catch (error) {
    console.error('Database Update Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// Update Category Selection
app.post('/api/db/update-category', async (req, res) => {
  try {
    const { sku, categoryId, categoryName } = req.body

    if (!pool) return res.status(500).json({ success: false, error: 'No DB connection' })

    const query = `
      UPDATE imported_products 
      SET 
        selected_category_id = ?,
        ideasoft_category_name = ?
      WHERE sku = ?
    `

    await pool.query(query, [categoryId, categoryName, sku])
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message })
  }
})


app.listen(PORT, () => {
  console.log(`🚀 Development API server running on http://localhost:${PORT}`)
})