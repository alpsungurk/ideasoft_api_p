// Vercel Serverless Function - Web scraping için
const axios = require('axios')
const cheerio = require('cheerio')

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { productName, brand, url } = req.body

  if (!productName && !url) {
    return res.status(400).json({ error: 'Product name or URL required' })
  }

  try {
    let targetUrl = url

    // Eğer URL yoksa, Google'da arama yap
    if (!targetUrl) {
      targetUrl = await searchProductUrl(productName, brand)
    }

    if (!targetUrl) {
      console.log(`⚠️ URL not found for: ${productName}, brand: ${brand}`)
      console.log(`💡 Google API Key: ${process.env.GOOGLE_API_KEY ? 'Set' : 'NOT SET'}`)
      console.log(`💡 Google Search Engine ID: ${process.env.GOOGLE_SEARCH_ENGINE_ID ? 'Set' : 'NOT SET'}`)
      
      // URL bulunamadıysa bile, genel arama yaparak açıklama bulmaya çalış
      const fallbackInfo = await tryAlternativeSearch(productName, brand)
      
      // Eğer hala generic açıklama varsa, en azından ürün adından daha iyi bir açıklama oluştur
      let finalDescription = fallbackInfo.description || generateFallbackDescription(productName, brand)
      if (finalDescription.includes('Yüksek kaliteli ve güvenilir ürün')) {
        // Ürün adından daha detaylı bir açıklama oluştur
        finalDescription = createBetterDescription(productName, brand)
      }
      
      return res.status(200).json({
        success: false,
        error: 'Product URL not found - Google API key may be missing',
        url: '',
        description: finalDescription,
        image: fallbackInfo.image || ''
      })
    }

    // URL'den içeriği çek
    const { description, image } = await scrapeProductInfo(targetUrl, productName, brand)

    // Eğer açıklama hala generic ise, alternatif yöntemler dene
    if (!description || description.length < 50 || description.includes('Yüksek kaliteli ve güvenilir ürün')) {
      console.log(`Generic description found, trying alternatives for: ${productName}`)
      const altInfo = await tryAlternativeSearch(productName, brand)
      if (altInfo.description && altInfo.description.length > 50) {
        return res.status(200).json({
          success: true,
          url: targetUrl,
          description: altInfo.description,
          image: altInfo.image || image
        })
      }
    }

    return res.status(200).json({
      success: true,
      url: targetUrl,
      description,
      image
    })
  } catch (error) {
    console.error('Scraping error:', error)
    return res.status(500).json({
      error: error.message,
      description: generateFallbackDescription(productName, brand),
      image: ''
    })
  }
}

/**
 * Google'da ürün URL'ini ara
 */
async function searchProductUrl(productName, brand = '') {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
    const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      console.warn('Google API credentials not found')
      return null
    }

    // Önce marka sitesinde ara
    const brandSites = ['asus.com', 'amazon.com.tr', 'hepsiburada.com', 'trendyol.com', 'n11.com']
    const searchQueries = []
    
    // Marka sitesi varsa önce onu dene
    if (brand) {
      const brandLower = brand.toLowerCase()
      if (brandLower.includes('asus')) {
        searchQueries.push(`${productName} site:asus.com`)
      }
      searchQueries.push(`${brand} ${productName}`)
    }
    
    // Genel arama
    searchQueries.push(`${productName}`)
    
    // E-ticaret sitelerinde ara
    for (const site of brandSites) {
      searchQueries.push(`${productName} site:${site}`)
    }

    // Her query'yi dene
    for (const query of searchQueries) {
      try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_SEARCH_ENGINE_ID,
            q: query,
            num: 5
          },
          timeout: 10000
        })

        if (response.data.items && response.data.items.length > 0) {
          // ASUS sitesini tercih et
          const asusUrl = response.data.items.find(item => 
            item.link.includes('asus.com')
          )
          if (asusUrl) return asusUrl.link
          
          // E-ticaret sitelerini tercih et
          const ecommerceUrl = response.data.items.find(item => 
            brandSites.some(site => item.link.includes(site))
          )
          if (ecommerceUrl) return ecommerceUrl.link
          
          // İlk sonucu döndür
          return response.data.items[0].link
        }
      } catch (queryError) {
        console.warn(`Query "${query}" failed:`, queryError.message)
        continue
      }
    }

    return null
  } catch (error) {
    console.error('Search error:', error)
    return null
  }
}

/**
 * URL'yi normalize et (relative'yi absolute'ye çevir)
 */
function normalizeUrl(url, baseUrl) {
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

/**
 * JSON-LD'den ürün bilgilerini çıkar
 */
function extractFromJsonLd($) {
  let jsonLdData = null
  
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const content = $(el).html()
      if (!content) return
      
      const data = JSON.parse(content)
      
      // Helper function: @type kontrolü (Product veya http://schema.org/Product)
      const isProductType = (type) => {
        if (!type) return false
        if (typeof type === 'string') {
          return type === 'Product' || type.includes('Product') || type.includes('schema.org/Product')
        }
        if (Array.isArray(type)) {
          return type.some(t => t === 'Product' || (typeof t === 'string' && (t.includes('Product') || t.includes('schema.org/Product'))))
        }
        return false
      }
      
      // Helper function: Product bul
      const findProduct = (obj) => {
        if (!obj) return null
        
        // Direkt Product kontrolü
        if (isProductType(obj['@type'])) {
          return obj
        }
        
        // @graph içinde ara
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          const product = obj['@graph'].find(item => isProductType(item['@type']))
          if (product) return product
        }
        
        // Array formatında gelen JSON-LD'leri kontrol et
        if (Array.isArray(obj)) {
          return obj.find(item => item && isProductType(item['@type']))
        }
        
        return null
      }
      
      const productData = findProduct(data)
      if (productData) {
        jsonLdData = productData
        return false // İlk bulduğunu al
      }
    } catch (e) {
      // JSON parse hatası, devam et
    }
  })
  
  if (!jsonLdData) return { description: '', image: '' }
  
  // Description çıkar
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
  
  // Image çıkar
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
    } else if (Array.isArray(image) && image.length > 0) {
      image = image[0]
      if (typeof image === 'object') {
        image = image.url || image['@id'] || image.contentUrl || ''
      }
    }
  }
  
  return {
    description: typeof description === 'string' ? description.trim() : '',
    image: typeof image === 'string' ? image.trim() : ''
  }
}

/**
 * Tüm img tag'lerinden en büyük resmi seç
 */
function findLargestImage($, baseUrl) {
  let largestImage = ''
  let maxArea = 0
  
  $('img').each((i, el) => {
    const $img = $(el)
    
    // Lazy-load attribute'larını kontrol et
    let src = $img.attr('src') || 
              $img.attr('data-src') || 
              $img.attr('data-lazy-src') ||
              $img.attr('data-original') || ''
    
    // data-srcset'i parse et (format: "url1 1x, url2 2x" veya "url1 100w, url2 200w")
    if (!src) {
      const srcset = $img.attr('data-srcset') || $img.attr('srcset') || ''
      if (srcset) {
        const srcsetParts = srcset.split(',')
        if (srcsetParts.length > 0) {
          // En büyük boyutlu resmi al (200w > 100w gibi)
          let maxWidth = 0
          srcsetParts.forEach(part => {
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
                // Eğer width yoksa, ilk URL'i al
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
    
    // Icon ve logo'ları filtrele
    const srcLower = src.toLowerCase()
    if (srcLower.includes('icon') || 
        srcLower.includes('logo') || 
        srcLower.includes('avatar') ||
        srcLower.includes('favicon') ||
        srcLower.includes('sprite') ||
        srcLower.includes('placeholder')) {
      return
    }
    
    // Width ve height'ı al
    let width = parseInt($img.attr('width')) || 0
    let height = parseInt($img.attr('height')) || 0
    
    // Eğer width/height yoksa, style'dan çıkarmaya çalış
    if (!width || !height) {
      const style = $img.attr('style') || ''
      const widthMatch = style.match(/width:\s*(\d+)px/)
      const heightMatch = style.match(/height:\s*(\d+)px/)
      if (widthMatch) width = parseInt(widthMatch[1])
      if (heightMatch) height = parseInt(heightMatch[1])
    }
    
    // Eğer hala width/height yoksa, src'den çıkarmaya çalış (örnek: image_800x600.jpg)
    if (!width || !height) {
      const sizeMatch = src.match(/(\d+)x(\d+)/)
      if (sizeMatch) {
        width = parseInt(sizeMatch[1])
        height = parseInt(sizeMatch[2])
      }
    }
    
    // Minimum boyut kontrolü (çok küçük resimleri filtrele)
    // Eğer width/height bilinmiyorsa, varsayılan olarak büyük resim kabul et
    if (width > 0 && height > 0 && width < 100 && height < 100) {
      return
    }
    
    // Alan hesapla (width/height yoksa, varsayılan olarak büyük sayı ver)
    const area = width > 0 && height > 0 ? width * height : 1000000
    
    if (area > maxArea) {
      largestImage = src
      maxArea = area
    }
  })
  
  return largestImage ? normalizeUrl(largestImage, baseUrl) : ''
}

/**
 * Sayfa içeriğinden açıklama çıkar (ASUS özel + genel)
 */
function extractDescriptionFromContent($, url, productName) {
  let description = ''
  
  // ASUS sitesi için özel parsing
  if (url.includes('asus.com')) {
    // ASUS sitesindeki ana açıklama bölümlerini bul
    const mainContent = $('h1, h2, h3').filter((i, el) => {
      const text = $(el).text().toLowerCase()
      return text.includes('overview') || text.includes('genel') || text.includes('bakış') || 
             text.includes('introduction') || text.includes('giriş') || text.includes('özellik')
    }).first()

    if (mainContent.length) {
      // Başlıktan sonraki paragrafları al
      let descParts = []
      mainContent.nextAll('p, div, section').each((i, elem) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        if (text.length > 50 && text.length < 800 && !descParts.includes(text)) {
          // HTML etiketlerini temizle
          const cleanText = text.replace(/<[^>]*>/g, '').trim()
          if (cleanText.length > 50) {
            descParts.push(cleanText)
            if (descParts.length >= 5) return false // İlk 5 paragrafı al
          }
        }
      })
      if (descParts.length > 0) {
        description = descParts.join(' ').trim()
      }
    }

    // Hala yoksa, tüm paragraflardan en uzun olanı al
    if (!description || description.length < 50) {
      let longestText = ''
      $('p, div[class*="content"], div[class*="description"], div[class*="text"], section p').each((i, elem) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        // HTML etiketlerini temizle
        const cleanText = text.replace(/<[^>]*>/g, '').trim()
        if (cleanText.length > longestText.length && cleanText.length > 100 && cleanText.length < 2000) {
          // Gereksiz metinleri filtrele
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
    // Genel scraping (diğer siteler için)
    // Çeşitli selector'ları dene
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

    // Hala yoksa, tüm paragraflardan en uzun olanı al
    if (!description || description.length < 50) {
      let longestText = ''
      $('p, div[class*="content"], div[class*="text"]').each((i, elem) => {
        const text = $(elem).text().trim().replace(/\s+/g, ' ')
        if (text.length > longestText.length && text.length > 100 && text.length < 2000) {
          // HTML etiketlerini ve gereksiz karakterleri temizle
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

/**
 * Ürün sayfasından bilgileri scrape et
 */
async function scrapeProductInfo(url, productName, brand) {
  try {
    // 1. Sayfayı çek
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    let description = ''
    let image = ''

    // 2. JSON-LD kontrol et ve description/image al (EN ÖNCELİKLİ)
    const jsonLdInfo = extractFromJsonLd($)
    if (jsonLdInfo.description && jsonLdInfo.description.length >= 30) {
      description = jsonLdInfo.description
    }
    if (jsonLdInfo.image) {
      image = normalizeUrl(jsonLdInfo.image, url)
    }

    // 3. JSON-LD yoksa veya eksikse meta tag'lerden al
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

    // 4. Meta tag'lerden de yoksa sayfa içeriğinden al
    if (!description || description.length < 50) {
      const contentDescription = extractDescriptionFromContent($, url, productName)
      if (contentDescription && contentDescription.length >= 50) {
        description = contentDescription
      }
    }

    // 5. Image yoksa tüm img tag'lerinden en büyük resmi seç
    if (!image) {
      image = findLargestImage($, url)
    }
    
    // 6. Hala image yoksa, picture tag'lerini kontrol et
    if (!image) {
      $('picture source').each((i, el) => {
        const srcset = $(el).attr('srcset')
        if (srcset) {
          const srcsetParts = srcset.split(',')
          if (srcsetParts.length > 0) {
            const firstSrc = srcsetParts[0].trim().split(/\s+/)[0]
            if (firstSrc) {
              image = normalizeUrl(firstSrc, url)
              return false // İlk bulduğunu al
            }
          }
        }
      })
    }

    // Açıklamayı temizle ve kontrol et
    if (description) {
      description = description.trim()
        .replace(/\s+/g, ' ')
        .replace(/<[^>]*>/g, '')
        .substring(0, 1000) // Maksimum 1000 karakter
    }

    // 6. Description yoksa veya çok kısaysa fallback kullan
    if (!description || description.length < 50) {
      description = createBetterDescription(productName, brand)
    }

    // 7. Sonuç döndür
    return {
      description: description.trim(),
      image: image ? image.trim() : `https://source.unsplash.com/800x600/?${encodeURIComponent(brand + ' ' + productName)}`
    }
  } catch (error) {
    console.error('Scraping error:', error)
    return {
      description: generateFallbackDescription(productName, brand),
      image: ''
    }
  }
}

/**
 * Fallback açıklama oluştur
 */
/**
 * Alternatif arama yöntemleri dene
 */
async function tryAlternativeSearch(productName, brand = '') {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
    const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID

    if (!GOOGLE_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
      return { description: '', image: '' }
    }

    // Google'da ürün hakkında genel bilgi ara
    const searchQuery = `${brand} ${productName} özellikler teknik detaylar`
    
    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: GOOGLE_API_KEY,
          cx: GOOGLE_SEARCH_ENGINE_ID,
          q: searchQuery,
          num: 3
        },
        timeout: 10000
      })

      if (response.data.items && response.data.items.length > 0) {
        // İlk sonuçtan scraping yapmayı dene
        for (const item of response.data.items) {
          try {
            const { description, image } = await scrapeProductInfo(item.link, productName, brand)
            if (description && description.length > 50 && !description.includes('Yüksek kaliteli ve güvenilir ürün')) {
              return { description, image }
            }
          } catch (err) {
            continue
          }
        }
      }
    } catch (error) {
      console.error('Alternative search error:', error.message)
    }

    return { description: '', image: '' }
  } catch (error) {
    console.error('Alternative search failed:', error)
    return { description: '', image: '' }
  }
}

/**
 * Daha iyi bir açıklama oluştur (ürün adından)
 */
function createBetterDescription(productName, brand = '') {
  const brandText = brand ? `${brand} ` : ''
  
  // Ürün adından özellikler çıkarmaya çalış
  const nameLower = productName.toLowerCase()
  let features = []
  
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
  
  const featuresText = features.length > 0 ? ` ${features.join(', ')} özelliklerine sahip` : ''
  
  return `${brandText}${productName}${featuresText}. Modern teknoloji ve kaliteli malzeme kullanılarak üretilmiştir. Detaylı teknik özellikler ve kullanım bilgileri için ürün sayfasını ziyaret edin.`
}

function generateFallbackDescription(productName, brand = '') {
  return createBetterDescription(productName, brand)
}

