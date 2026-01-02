// Supabase Edge Function - Web Scraping (Google Search + Cheerio)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper functions
const normalizeUrl = (url: string, baseUrl: string) => {
  if (!url) return ''
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  try {
    const urlObj = new URL(baseUrl)
    if (url.startsWith('//')) {
      return 'https:' + url
    } else if (url.startsWith('/')) {
      return urlObj.origin + url
    } else {
      return urlObj.origin + '/' + url
    }
  } catch (e) {
    return url
  }
}

const extractFromJsonLd = ($: any) => {
  let jsonLdData: any = null
  
  $('script[type="application/ld+json"]').each((i: number, el: any) => {
    try {
      const content = $(el).html()
      if (!content) return
      
      const data = JSON.parse(content)
      
      const isProductType = (type: any) => {
        if (!type) return false
        if (typeof type === 'string') {
          return type === 'Product' || type.includes('Product') || type.includes('schema.org/Product')
        }
        if (Array.isArray(type)) {
          return type.some((t: any) => t === 'Product' || (typeof t === 'string' && (t.includes('Product') || t.includes('schema.org/Product'))))
        }
        return false
      }
      
      const findProduct = (obj: any) => {
        if (!obj) return null
        
        if (isProductType(obj['@type'])) {
          return obj
        }
        
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          const product = obj['@graph'].find((item: any) => isProductType(item['@type']))
          if (product) return product
        }
        
        if (Array.isArray(obj)) {
          return obj.find((item: any) => item && isProductType(item['@type']))
        }
        
        return null
      }
      
      const productData = findProduct(data)
      if (productData) {
        jsonLdData = productData
        return false
      }
    } catch (e) {
      // ignore
    }
  })
  
  if (!jsonLdData) return { description: '', image: '' }
  
  let description = jsonLdData.description || ''
  if (typeof description === 'object') {
    if (description['@value']) {
      description = description['@value']
    } else if (Array.isArray(description) && description.length > 0) {
      description = description[0]
      if (typeof description === 'object' && description['@value']) {
        description = description['@value']
      }
    }
  }
  
  let image = jsonLdData.image || ''
  if (Array.isArray(image)) {
    image = image[0] || ''
  }
  if (typeof image === 'object') {
    if (image['@id']) {
      image = image['@id']
    } else if (image.url) {
      image = image.url
    } else if (image.contentUrl) {
      image = image.contentUrl
    }
  }
  
  return {
    description: typeof description === 'string' ? description.trim() : '',
    image: typeof image === 'string' ? image.trim() : ''
  }
}

const findLargestImage = ($: any, baseUrl: string) => {
  let largestImage = ''
  let maxArea = 0
  
  $('img').each((i: number, el: any) => {
    const $img = $(el)
    
    let src = $img.attr('src') || 
              $img.attr('data-src') || 
              $img.attr('data-lazy-src') ||
              $img.attr('data-original') || ''
    
    if (!src) {
      const srcset = $img.attr('data-srcset') || $img.attr('srcset') || ''
      if (srcset) {
        const srcsetParts = srcset.split(',')
        if (srcsetParts.length > 0) {
          let maxWidth = 0
          srcsetParts.forEach((part: string) => {
            const trimmed = part.trim()
            const parts = trimmed.split(/\s+/)
            if (parts.length >= 2) {
              const widthMatch = parts[1].match(/(\d+)w/)
              if (widthMatch) {
                const width = parseInt(widthMatch[1])
                if (width > maxWidth) {
                  maxWidth = width
                  src = parts[0]
                }
              } else {
                if (!src) src = parts[0]
              }
            } else if (parts.length === 1 && !src) {
              src = parts[0]
            }
          })
        }
      }
    }
    
    if (!src) return
    
    const srcLower = src.toLowerCase()
    if (srcLower.includes('icon') || 
        srcLower.includes('logo') || 
        srcLower.includes('avatar') ||
        srcLower.includes('favicon') ||
        srcLower.includes('sprite') ||
        srcLower.includes('placeholder')) {
      return
    }
    
    let width = parseInt($img.attr('width') || '0') || 0
    let height = parseInt($img.attr('height') || '0') || 0
    
    if (!width || !height) {
      const style = $img.attr('style') || ''
      const widthMatch = style.match(/width:\s*(\d+)px/)
      const heightMatch = style.match(/height:\s*(\d+)px/)
      if (widthMatch) width = parseInt(widthMatch[1])
      if (heightMatch) height = parseInt(heightMatch[1])
    }
    
    if (!width || !height) {
      const sizeMatch = src.match(/(\d+)x(\d+)/)
      if (sizeMatch) {
        width = parseInt(sizeMatch[1])
        height = parseInt(sizeMatch[2])
      }
    }
    
    if (width > 0 && height > 0 && width < 100 && height < 100) {
      return
    }
    
    const area = width > 0 && height > 0 ? width * height : 1000000
    
    if (area > maxArea) {
      largestImage = src
      maxArea = area
    }
  })
  
  return largestImage ? normalizeUrl(largestImage, baseUrl) : ''
}

const extractDescriptionFromContent = ($: any, url: string, productName: string) => {
  let description = ''
  
  if (url.includes('asus.com')) {
    const mainContent = $('h1, h2, h3').filter((i: number, el: any) => {
      const text = $(el).text().toLowerCase()
      return text.includes('overview') || text.includes('genel') || text.includes('bakış') || 
             text.includes('introduction') || text.includes('giriş') || text.includes('özellik')
    }).first()

    if (mainContent.length) {
      let descParts: string[] = []
      mainContent.nextAll('p, div, section').each((i: number, elem: any) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        if (text.length > 50 && text.length < 800 && !descParts.includes(text)) {
          const cleanText = text.replace(/<[^>]*>/g, '').trim()
          if (cleanText.length > 50) {
            descParts.push(cleanText)
            if (descParts.length >= 5) return false
          }
        }
      })
      if (descParts.length > 0) {
        description = descParts.join(' ').trim()
      }
    }

    if (!description || description.length < 50) {
      let longestText = ''
      $('p, div[class*="content"], div[class*="description"], div[class*="text"], section p').each((i: number, elem: any) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        const cleanText = text.replace(/<[^>]*>/g, '').trim()
        if (cleanText.length > longestText.length && cleanText.length > 100 && cleanText.length < 2000) {
          if (!cleanText.toLowerCase().includes('cookie') && 
              !cleanText.toLowerCase().includes('privacy') &&
              !cleanText.toLowerCase().includes('terms')) {
            longestText = cleanText
          }
        }
      })
      if (longestText) description = longestText
    }
  } else {
    const descriptionSelectors = [
      '.product-description',
      '.description',
      '.product-info',
      '.product-details',
      '[class*="description"]',
      '[class*="detail"]',
      '[id*="description"]',
      'article p',
      '.content p',
      'main p'
    ]

    for (const selector of descriptionSelectors) {
      const text = $(selector).first().text().trim()
      if (text && text.length > 100 && text.length < 2000) {
        description = text
        break
      }
    }

    if (!description || description.length < 50) {
      let longestText = ''
      $('p, div[class*="content"], div[class*="text"]').each((i: number, elem: any) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        if (text.length > longestText.length && text.length > 100 && text.length < 2000) {
          const cleanText = text.replace(/<[^>]*>/g, '').trim()
          if (cleanText.length > 100) {
            longestText = cleanText
          }
        }
      })
      if (longestText) description = longestText
    }
  }
  
  return description
}

async function scrapeProductInfo(url: string, productName: string, brand: string) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    const $ = load(html)
    let description = ''
    let image = ''

    const jsonLdInfo = extractFromJsonLd($)
    if (jsonLdInfo.description && jsonLdInfo.description.length >= 30) {
      description = jsonLdInfo.description
    }
    if (jsonLdInfo.image) {
      image = normalizeUrl(jsonLdInfo.image, url)
    }

    if (!description || description.length < 50) {
      const ogDesc = $('meta[property="og:description"]').attr('content')
      const metaDesc = $('meta[name="description"]').attr('content')
      const twitterDesc = $('meta[name="twitter:description"]').attr('content')
      
      description = ogDesc || metaDesc || twitterDesc || description
    }
    
    if (!image) {
      const ogImage = $('meta[property="og:image"]').attr('content')
      const metaImage = $('meta[name="og:image"]').attr('content')
      const twitterImage = $('meta[name="twitter:image"]').attr('content')
      const linkImage = $('link[rel="image_src"]').attr('href')
      
      const metaImageUrl = ogImage || metaImage || twitterImage || linkImage
      if (metaImageUrl) {
        image = normalizeUrl(metaImageUrl, url)
      }
    }

    if (!description || description.length < 50) {
      const contentDescription = extractDescriptionFromContent($, url, productName)
      if (contentDescription && contentDescription.length >= 50) {
        description = contentDescription
      }
    }

    if (!image) {
      image = findLargestImage($, url)
    }
    
    if (!image) {
      $('picture source').each((i: number, el: any) => {
        const srcset = $(el).attr('srcset')
        if (srcset) {
          const srcsetParts = srcset.split(',')
          if (srcsetParts.length > 0) {
            const firstSrc = srcsetParts[0].trim().split(/\s+/)[0]
            if (firstSrc) {
              image = normalizeUrl(firstSrc, url)
              return false
            }
          }
        }
      })
    }

    if (description) {
      description = description.trim()
        .replace(/\s+/g, ' ')
        .replace(/<[^>]*>/g, '')
        .substring(0, 1000)
    }

    if (!description || description.length < 50) {
      description = createBetterDescription(productName, brand)
    }

    return {
      description: description.trim(),
      image: image ? image.trim() : `https://source.unsplash.com/800x600/?${encodeURIComponent(brand + ' ' + productName)}`
    }
  } catch (error: any) {
    console.error('Scraping error:', error)
    return {
      description: generateFallbackDescription(productName, brand),
      image: ''
    }
  }
}

// Image search için helper function
async function searchProductImage(query: string, brand: string = '') {
  try {
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VITE_GOOGLE_API_KEY')
    const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || Deno.env.get('VITE_GOOGLE_SEARCH_ENGINE_ID')

    console.log('🔍 Image search başlatıldı:', { 
      query, 
      brand, 
      hasApiKey: !!GOOGLE_API_KEY, 
      hasEngineId: !!GOOGLE_SEARCH_ENGINE_ID,
      apiKeyLength: GOOGLE_API_KEY?.length || 0,
      engineIdLength: GOOGLE_SEARCH_ENGINE_ID?.length || 0
    })

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.error('❌ Google API credentials eksik:', {
        hasApiKey: !!GOOGLE_API_KEY,
        hasEngineId: !!GOOGLE_SEARCH_ENGINE_ID,
        envKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('GOOGLE'))
      })
      return null
    }

    // Engine ID'yi temizle (başında/sonunda boşluk varsa kaldır)
    let cleanEngineId = GOOGLE_SEARCH_ENGINE_ID.trim()
    
    // Engine ID sonunda "A" harfi varsa kaldır (Google Custom Search Engine ID'ler genellikle sadece alfanumerik)
    // Eğer son karakter "A" ise ve öncesi sayısal ise, muhtemelen yanlış eklenmiş olabilir
    if (cleanEngineId.endsWith('A') && cleanEngineId.length > 1) {
      const withoutA = cleanEngineId.slice(0, -1)
      // Eğer "A" harfinden önceki kısım sadece sayı ve küçük harflerden oluşuyorsa, "A" harfini kaldır
      if (/^[a-z0-9]+$/.test(withoutA)) {
        console.warn('⚠️ Engine ID sonundaki "A" harfi kaldırılıyor:', cleanEngineId, '->', withoutA)
        cleanEngineId = withoutA
      }
    }
    
    // Query'yi temizle ve normalize et
    const cleanQuery = query.trim().replace(/\s+/g, ' ')
    
    console.log('🔧 Temizlenmiş değerler:', {
      engineId: cleanEngineId,
      engineIdLength: cleanEngineId.length,
      query: cleanQuery,
      originalEngineId: GOOGLE_SEARCH_ENGINE_ID
    })

    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
    searchUrl.searchParams.set('key', GOOGLE_API_KEY.trim())
    searchUrl.searchParams.set('cx', cleanEngineId)
    searchUrl.searchParams.set('q', cleanQuery)
    searchUrl.searchParams.set('searchType', 'image')
    searchUrl.searchParams.set('num', '5')

    const finalUrl = searchUrl.toString()
    const maskedUrl = finalUrl
      .replace(GOOGLE_API_KEY.trim(), '***')
      .replace(cleanEngineId, '***')
    console.log('📡 Google API isteği gönderiliyor:', maskedUrl)
    console.log('📋 API Key (ilk 10 karakter):', GOOGLE_API_KEY?.trim().substring(0, 10) + '...')
    console.log('📋 Engine ID (temizlenmiş):', cleanEngineId)
    console.log('📋 Engine ID uzunluğu:', cleanEngineId.length)
    console.log('📋 Query (temizlenmiş):', cleanQuery)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    console.log('📥 Google API yanıtı:', { status: response.status, ok: response.ok })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const maskedErrorUrl = searchUrl.toString()
        .replace(GOOGLE_API_KEY.trim(), '***')
        .replace(cleanEngineId, '***')
      console.error('❌ Google API hatası:', { 
        status: response.status, 
        error: errorData,
        url: maskedErrorUrl,
        engineId: cleanEngineId,
        query: cleanQuery
      })
      
      // Detaylı hata mesajı
      if (errorData.error) {
        const errorMsg = errorData.error.message || ''
        console.error('❌ Google API Error Details:', {
          code: errorData.error.code,
          message: errorMsg,
          domain: errorData.error.domain,
          reason: errorData.error.reason
        })
        
        // Invalid API key hatası
        if (errorMsg.includes('invalid') && errorMsg.includes('key')) {
          console.error('❌ Geçersiz API Key! Lütfen Supabase Secrets\'da GOOGLE_API_KEY\'i kontrol edin.')
        }
        
        // Invalid CX hatası
        if (errorMsg.includes('invalid') && (errorMsg.includes('cx') || errorMsg.includes('custom search engine'))) {
          console.error('❌ Geçersiz Search Engine ID! Lütfen Supabase Secrets\'da GOOGLE_SEARCH_ENGINE_ID\'yi kontrol edin.')
          console.error('💡 Beklenen format: b1c94fd7831204066A (sonunda A harfi olmalı)')
        }
      }
      
      if (response.status === 429 || errorData.error?.message?.toLowerCase().includes('quota')) {
        throw new Error('GOOGLE_QUOTA_EXCEEDED')
      }
      return null
    }

    const data = await response.json()
    
    // Google API error kontrolü (önce error kontrolü yap)
    if (data.error) {
      console.error('❌ Google API error response:', JSON.stringify(data.error, null, 2))
      
      // Detaylı hata mesajı
      const errorMsg = data.error.message || ''
      if (errorMsg.includes('invalid') && errorMsg.includes('key')) {
        console.error('❌ Geçersiz API Key! Lütfen Supabase Secrets\'da GOOGLE_API_KEY\'i kontrol edin.')
      }
      if (errorMsg.includes('invalid') && (errorMsg.includes('cx') || errorMsg.includes('custom search engine'))) {
        console.error('❌ Geçersiz Search Engine ID! Lütfen Supabase Secrets\'da GOOGLE_SEARCH_ENGINE_ID\'yi kontrol edin.')
        console.error('💡 Beklenen format: b1c94fd7831204066A (sonunda A harfi olmalı)')
      }
      
      if (errorMsg.toLowerCase().includes('quota') || 
          errorMsg.toLowerCase().includes('limit') ||
          errorMsg.toLowerCase().includes('exceeded')) {
        throw new Error('GOOGLE_QUOTA_EXCEEDED')
      }
      // API key hatası veya başka bir hata
      console.warn('⚠️ Google API hatası:', errorMsg || 'Bilinmeyen hata')
      return null
    }
    
    console.log('📦 Google API data:', JSON.stringify({
      hasItems: !!data.items,
      itemsCount: data.items?.length || 0,
      searchInformation: data.searchInformation,
      queries: data.queries,
      totalResults: data.searchInformation?.totalResults || 'N/A'
    }, null, 2))
    
    if (data.items && data.items.length > 0) {
      // İlk 5 sonuçtan en iyisini seç (büyük resim, iyi kalite)
      let bestImage = data.items[0].link
      
      // Eğer birden fazla sonuç varsa, en büyük boyutlu olanı seç
      for (const item of data.items) {
        // imageWidth ve imageHeight varsa, en büyük olanı seç
        const width = item.image?.width || item.imageWidth || 0
        const height = item.image?.height || item.imageHeight || 0
        const currentWidth = data.items[0].image?.width || data.items[0].imageWidth || 0
        const currentHeight = data.items[0].image?.height || data.items[0].imageHeight || 0
        
        if (width * height > currentWidth * currentHeight) {
          bestImage = item.link
        }
      }
      
      console.log('✅ Resim bulundu:', bestImage)
      return bestImage
    }
    
    // Items yoksa veya boşsa, alternatif yöntem dene: Web search yap ve ilk sonuçtan resim çek
    console.warn('⚠️ Resim bulunamadı - items boş veya yok. Alternatif yöntem deneniyor...')
    console.log('📋 Full response (ilk 500 karakter):', JSON.stringify(data).substring(0, 500))
    
    // Alternatif: Web search yap ve ilk sonuçtan resim çek
    try {
      const webSearchUrl = new URL('https://www.googleapis.com/customsearch/v1')
      webSearchUrl.searchParams.set('key', GOOGLE_API_KEY)
      webSearchUrl.searchParams.set('cx', GOOGLE_SEARCH_ENGINE_ID)
      webSearchUrl.searchParams.set('q', query)
      webSearchUrl.searchParams.set('num', '3')
      
      const webController = new AbortController()
      const webTimeoutId = setTimeout(() => webController.abort(), 10000)
      
      const webResponse = await fetch(webSearchUrl.toString(), {
        method: 'GET',
        signal: webController.signal
      })
      
      clearTimeout(webTimeoutId)
      
      if (webResponse.ok) {
        const webData = await webResponse.json()
        if (webData.items && webData.items.length > 0) {
          // İlk web sonucundan resim çek
          const firstUrl = webData.items[0].link
          console.log('🌐 Web search sonucu bulundu, resim çekiliyor:', firstUrl)
          
          try {
            const { image } = await scrapeProductInfo(firstUrl, query, brand || '')
            if (image && image.length > 0) {
              console.log('✅ Alternatif yöntemle resim bulundu:', image)
              return image
            }
          } catch (scrapeError: any) {
            console.warn('⚠️ Web scraping hatası:', scrapeError.message)
          }
        }
      }
    } catch (altError: any) {
      console.warn('⚠️ Alternatif arama hatası:', altError.message)
    }
    
    return null
  } catch (error: any) {
    if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
      console.error('❌ GOOGLE_QUOTA_EXCEEDED')
      throw error
    }
    console.error('❌ Image search error:', error.message || error)
    return null
  }
}

// Web search için helper function
async function searchWebResults(query: string) {
  try {
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VITE_GOOGLE_API_KEY')
    const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || Deno.env.get('VITE_GOOGLE_SEARCH_ENGINE_ID')

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.warn('Google API credentials not found')
      return []
    }

    const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
    searchUrl.searchParams.set('key', GOOGLE_API_KEY)
    searchUrl.searchParams.set('cx', GOOGLE_SEARCH_ENGINE_ID)
    searchUrl.searchParams.set('q', query)
    searchUrl.searchParams.set('num', '10')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn('Web search error:', response.status, response.statusText)
      return []
    }

    const data = await response.json()
    if (data.items && Array.isArray(data.items)) {
      return data.items.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet
      }))
    }
    return []
  } catch (error: any) {
    console.warn('Web search error:', error.message)
    return []
  }
}

async function searchProductUrl(productName: string, brand: string = '') {
  try {
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VITE_GOOGLE_API_KEY')
    const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || Deno.env.get('VITE_GOOGLE_SEARCH_ENGINE_ID')

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.warn('Google API credentials not found')
      return null
    }

    const brandSites = ['asus.com', 'amazon.com.tr', 'hepsiburada.com', 'trendyol.com', 'n11.com']
    const searchQueries: string[] = []
    
    if (brand) {
      const brandLower = brand.toLowerCase()
      if (brandLower.includes('asus')) {
        searchQueries.push(`${productName} site:asus.com`)
      }
      searchQueries.push(`${brand} ${productName}`)
    }
    
    searchQueries.push(`${productName}`)
    
    for (const site of brandSites) {
      searchQueries.push(`${productName} site:${site}`)
    }

    for (const query of searchQueries) {
      try {
        const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
        searchUrl.searchParams.set('key', GOOGLE_API_KEY)
        searchUrl.searchParams.set('cx', GOOGLE_SEARCH_ENGINE_ID)
        searchUrl.searchParams.set('q', query)
        searchUrl.searchParams.set('num', '5')

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const response = await fetch(searchUrl.toString(), {
          method: 'GET',
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (data.items && data.items.length > 0) {
          const asusUrl = data.items.find((item: any) => 
            item.link.includes('asus.com')
          )
          if (asusUrl) return asusUrl.link
          
          const ecommerceUrl = data.items.find((item: any) => 
            brandSites.some((site: string) => item.link.includes(site))
          )
          if (ecommerceUrl) return ecommerceUrl.link
          
          return data.items[0].link
        }
      } catch (queryError: any) {
        console.warn(`Query "${query}" failed:`, queryError.message)
        continue
      }
    }

    return null
  } catch (error: any) {
    console.error('Search error:', error)
    return null
  }
}

async function tryAlternativeSearch(productName: string, brand: string = '') {
  try {
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VITE_GOOGLE_API_KEY')
    const GOOGLE_SEARCH_ENGINE_ID = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') || Deno.env.get('VITE_GOOGLE_SEARCH_ENGINE_ID')

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      return { description: '', image: '' }
    }

    const searchQuery = `${brand} ${productName} özellikler teknik detaylar`
    
    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1')
      searchUrl.searchParams.set('key', GOOGLE_API_KEY)
      searchUrl.searchParams.set('cx', GOOGLE_SEARCH_ENGINE_ID)
      searchUrl.searchParams.set('q', searchQuery)
      searchUrl.searchParams.set('num', '3')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(searchUrl.toString(), {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          try {
            const { description, image } = await scrapeProductInfo(item.link, productName, brand)
            if (description && description.length > 50 && !description.includes('Yüksek kaliteli ve güvenilir ürün')) {
              return { description, image }
            }
          } catch (err: any) {
            continue
          }
        }
      }
    } catch (error: any) {
      console.error('Alternative search error:', error.message)
    }

    return { description: '', image: '' }
  } catch (error: any) {
    console.error('Alternative search error:', error)
    return { description: '', image: '' }
  }
}

function createBetterDescription(productName: string, brand: string = '') {
  const brandText = brand ? `${brand} ` : ''
  
  const nameLower = productName.toLowerCase()
  let features: string[] = []
  
  if (nameLower.includes('gaming') || nameLower.includes('rog')) {
    features.push('oyuncu odaklı')
  }
  if (nameLower.includes('pro') || nameLower.includes('workstation')) {
    features.push('profesyonel kullanım')
  }
  if (nameLower.includes('wifi')) {
    features.push('WiFi desteği')
  }
  if (nameLower.includes('extreme') || nameLower.includes('apex')) {
    features.push('yüksek performans')
  }
  if (nameLower.includes('anakart')) {
    features.push('yüksek performanslı anakart')
  }
  if (nameLower.includes('işlemci')) {
    features.push('güçlü işlemci')
  }
  if (nameLower.includes('ekran kartı') || nameLower.includes('gpu')) {
    features.push('üstün grafik performansı')
  }
  if (nameLower.includes('ram') || nameLower.includes('bellek')) {
    features.push('hızlı bellek')
  }
  if (nameLower.includes('ssd') || nameLower.includes('depolama')) {
    features.push('geniş depolama alanı')
  }
  if (nameLower.includes('oyuncu')) {
    features.push('oyuncular için özel tasarım')
  }
  if (nameLower.includes('profesyonel')) {
    features.push('profesyonel kullanım için ideal')
  }
  if (nameLower.includes('ultra') || nameLower.includes('max')) {
    features.push('üst düzey özellikler')
  }
  if (nameLower.includes('rgb')) {
    features.push('RGB aydınlatma')
  }
  if (nameLower.includes('su soğutma')) {
    features.push('etkili su soğutma sistemi')
  }
  
  const featuresText = features.length > 0 ? ` ${features.join(', ')} özelliklerine sahip` : ''
  
  return `${brandText}${productName}${featuresText}. Modern teknoloji ve kaliteli malzeme kullanılarak üretilmiştir. Detaylı teknik özellikler ve kullanım bilgileri için ürün sayfasını ziyaret edin.`
}

function generateFallbackDescription(productName: string, brand: string = '') {
  return createBetterDescription(productName, brand)
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
  
  // Desteklenen formatlar:
  // 1. { productName, brand, url } - eski format
  // 2. { query, type: 'image' | 'web' } - yeni format (googleService.js'den)
  let productName: string | undefined
  let brand: string | undefined
  let url: string | undefined
  let query: string | undefined
  let type: string | undefined

  if (body.query) {
    // Yeni format: { query, type }
    query = body.query
    type = body.type || 'image'
    // Query'den productName ve brand çıkarmaya çalış
    const parts = query.trim().split(/\s+/)
    if (parts.length > 1) {
      brand = parts[0]
      productName = parts.slice(1).join(' ')
    } else {
      productName = query
    }
  } else {
    // Eski format: { productName, brand, url }
    productName = body.productName
    brand = body.brand
    url = body.url
  }

  if (!productName && !url && !query) {
    return new Response(
      JSON.stringify({ error: 'Product name, URL, or query required' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  // Eğer sadece image search isteniyorsa, sadece image döndür
  if (type === 'image' && query) {
    console.log('🖼️ Image search isteği alındı:', { query, brand, type })
    try {
      const imageUrl = await searchProductImage(query, brand || '')
      
      console.log('🖼️ Image search sonucu:', { imageUrl, hasUrl: !!imageUrl })
      
      if (!imageUrl) {
        console.warn('⚠️ Resim bulunamadı - null döndü')
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Resim bulunamadı',
            url: ''
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
      
      console.log('✅ Resim başarıyla bulundu, response döndürülüyor')
      return new Response(
        JSON.stringify({
          success: true,
          url: imageUrl
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } catch (error: any) {
      console.error('❌ Image search exception:', error.message || error)
      if (error.message === 'GOOGLE_QUOTA_EXCEEDED') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Google API quota aşıldı',
            quotaExceeded: true,
            url: ''
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
          error: error.message || 'Image search failed',
          url: ''
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }
  }

  // Eğer sadece web search isteniyorsa, sadece web results döndür
  if (type === 'web' && query) {
    try {
      const items = await searchWebResults(query)
      return new Response(
        JSON.stringify({
          success: true,
          items: items || []
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Web search failed',
          items: []
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }
  }

  try {
    let targetUrl = url

    // Eğer URL yoksa, Google'da arama yap
    if (!targetUrl) {
      targetUrl = await searchProductUrl(productName, brand)
    }

    if (!targetUrl) {
      console.log(`⚠️ URL not found for: ${productName}, brand: ${brand}`)
      console.log(`💡 Google API Key: ${Deno.env.get('GOOGLE_API_KEY') ? 'Set' : 'NOT SET'}`)
      console.log(`💡 Google Search Engine ID: ${Deno.env.get('GOOGLE_SEARCH_ENGINE_ID') ? 'Set' : 'NOT SET'}`)
      
      const fallbackInfo = await tryAlternativeSearch(productName, brand)
      
      let finalDescription = fallbackInfo.description || generateFallbackDescription(productName, brand)
      if (finalDescription.includes('Yüksek kaliteli ve güvenilir ürün')) {
        finalDescription = createBetterDescription(productName, brand)
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Product URL not found - Google API key may be missing',
          url: '',
          description: finalDescription,
          image: fallbackInfo.image || ''
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // URL'den içeriği çek
    const { description, image } = await scrapeProductInfo(targetUrl, productName, brand)

    // Eğer açıklama hala generic ise, alternatif yöntemler dene
    if (!description || description.length < 50 || description.includes('Yüksek kaliteli ve güvenilir ürün')) {
      console.log(`Generic description found, trying alternatives for: ${productName}`)
      const altInfo = await tryAlternativeSearch(productName, brand)
      if (altInfo.description && altInfo.description.length > 50) {
        return new Response(
          JSON.stringify({
            success: true,
            url: targetUrl,
            description: altInfo.description,
            image: altInfo.image || image
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: targetUrl,
        description,
        image
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: any) {
    console.error('Scraping error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        description: generateFallbackDescription(productName, brand),
        image: ''
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

