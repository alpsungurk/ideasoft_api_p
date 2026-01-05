// Supabase Edge Function - Ideasoft Product to Categories
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

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  const body = await req.json()
  const { shopId, accessToken, productId, categoryId, productData, oldCategoryId } = body

  if (!shopId || !accessToken || !productId || !categoryId) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Shop ID, Access Token, Product ID ve Category ID gerekli' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    // PUT ise mevcut kategori ilişkisini güncelle (yeni kategori ekleme, mevcut kategoriyi değiştirme)
    // oldCategoryId varsa (kategori değişikliği yapılıyor), mevcut kategori ilişkisini bul ve güncelle
    if (req.method === 'PUT' || (oldCategoryId !== null && oldCategoryId !== undefined)) {
      console.log('Kategori güncellemesi yapılıyor, eski kategori ID:', oldCategoryId, 'Yeni kategori ID:', categoryId)
      
      try {
        // Önce ürünün mevcut bilgilerini al (kategoriler dahil)
        const productUrl = `https://${shopId}.myideasoft.com/admin-api/products/${productId}`
        const productResponse = await fetch(productUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        })
        
        if (productResponse.ok) {
          const productDataResponse = await productResponse.json()
          console.log('Ürün mevcut kategorileri:', productDataResponse.categories)
          
          // Ürünün mevcut kategorilerini sil
          if (productDataResponse.categories && Array.isArray(productDataResponse.categories)) {
            // Her kategori için product_to_categories ID'sini bul ve sil
            // Kategori objesi içinde product_to_categories ID'si olabilir
            for (const cat of productDataResponse.categories) {
              // Kategori objesi içinde id field'ı kategori ID'sidir
              // product_to_categories ID'sini almak için farklı bir yöntem kullanmalıyız
              
              // Ideasoft API'sinde product_to_categories endpoint'ini kullanarak
              // ürünün kategori ilişkilerini alalım
              try {
                // Farklı query formatlarını dene
                const queryParams = [
                  `product.id=${productId}`,
                  `productId=${productId}`,
                  `product=${productId}`
                ]
                
                let ptcList: any[] = []
                for (const queryParam of queryParams) {
                  try {
                    const ptcUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories?${queryParam}`
                    const ptcResponse = await fetch(ptcUrl, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                      }
                    })
                    
                    if (ptcResponse.ok) {
                      const ptcData = await ptcResponse.json()
                      ptcList = Array.isArray(ptcData) 
                        ? ptcData 
                        : (ptcData.items || ptcData.data || ptcData.results || [])
                      
                      if (ptcList.length > 0) {
                        console.log(`Product_to_categories bulundu (${queryParam}):`, ptcList.length)
                        break
                      }
                    }
                  } catch (e) {
                    // Bu query formatı çalışmadı, diğerini dene
                    continue
                  }
                }
                
                // Eğer product_to_categories listesi bulunamadıysa, kategori ID'si ile silmeyi dene
                if (ptcList.length === 0) {
                  console.warn('Product_to_categories listesi bulunamadı, kategori ID ile silme deneniyor...')
                  // Kategori objesi içinde product_to_categories ID'si olabilir
                  // Veya category.id ile product_to_categories ID'si aynı olabilir
                  for (const cat of productDataResponse.categories) {
                    if ((cat as any).id) {
                      try {
                        const deleteUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories/${(cat as any).id}`
                        const deleteResponse = await fetch(deleteUrl, {
                          method: 'DELETE',
                          headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                          }
                        })
                        if (deleteResponse.ok) {
                          console.log(`Kategori ilişkisi silindi (ID: ${(cat as any).id})`)
                        } else {
                          const errorText = await deleteResponse.text()
                          console.warn(`Kategori silinemedi (ID: ${(cat as any).id}):`, deleteResponse.status, errorText)
                        }
                      } catch (deleteError) {
                        console.warn('Kategori silme hatası:', deleteError)
                      }
                    }
                  }
                } else {
                  // Product_to_categories listesi bulundu
                  // İlk kategori ilişkisini bul (vitrinde gözüken, ilk eklenen kategori)
                  const firstPtc = ptcList.length > 0 ? ptcList[0] : null
                  
                  if (firstPtc && (firstPtc as any).id) {
                    // Mevcut kategori ilişkisini PUT ile güncelle
                    const updateUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories/${(firstPtc as any).id}`
                    
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
                    
                    try {
                      const updateResponse = await fetch(updateUrl, {
                        method: 'PUT',
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json',
                          'Accept': 'application/json'
                        },
                        body: JSON.stringify(productCategoryData)
                      })
                      
                      if (updateResponse.ok) {
                        const updateData = await updateResponse.json()
                        console.log(`Kategori ilişkisi güncellendi (ID: ${(firstPtc as any).id})`)
                        return new Response(
                          JSON.stringify({
                            success: true,
                            data: updateData
                          }),
                          { 
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            status: 200 
                          }
                        )
                      } else {
                        const errorText = await updateResponse.text()
                        console.warn(`Kategori güncellenemedi (ID: ${(firstPtc as any).id}):`, updateResponse.status, errorText)
                        // PUT başarısız oldu, DELETE + POST yap
                        console.log('PUT başarısız, DELETE + POST yöntemi deneniyor...')
                      }
                    } catch (updateError) {
                      console.warn('Kategori güncelleme hatası:', updateError)
                      // PUT başarısız oldu, DELETE + POST yap
                      console.log('PUT hatası, DELETE + POST yöntemi deneniyor...')
                    }
                  } else {
                    console.warn('Product_to_categories ID bulunamadı, POST ile yeni kategori eklenecek')
                  }
                  
                  // Eğer PUT başarısız olduysa veya ID bulunamadıysa, DELETE + POST yap
                  // Tüm kategori ilişkilerini sil
                  for (const ptc of ptcList) {
                    if ((ptc as any).id) {
                      try {
                        const deleteUrl = `https://${shopId}.myideasoft.com/admin-api/product_to_categories/${(ptc as any).id}`
                        const deleteResponse = await fetch(deleteUrl, {
                          method: 'DELETE',
                          headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                          }
                        })
                        if (deleteResponse.ok) {
                          console.log(`Product_to_categories silindi (ID: ${(ptc as any).id})`)
                        } else {
                          const errorText = await deleteResponse.text()
                          console.warn(`Product_to_categories silinemedi (ID: ${(ptc as any).id}):`, deleteResponse.status, errorText)
                        }
                      } catch (deleteError) {
                        console.warn('Product_to_categories silme hatası:', deleteError)
                      }
                    }
                  }
                }
              } catch (ptcError) {
                console.warn('Product_to_categories işlemi hatası:', ptcError)
              }
            }
          } else {
            console.log('Ürünün kategorisi yok, yeni kategori eklenecek')
          }
        } else {
          const errorText = await productResponse.text()
          console.warn('Ürün bilgisi alınamadı:', productResponse.status, errorText)
        }
      } catch (deleteError) {
        // Silme hatası kritik değil, devam et ama logla
        console.error('Eski kategori silme hatası:', deleteError)
      }
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

    // PUT ise DELETE + POST yap, yoksa sadece POST
    const response = await fetch(apiUrl, {
      method: 'POST', // Her zaman POST kullan (PUT için önce DELETE yaptık)
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(productCategoryData)
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
    console.error('Product Category API Error:', error)
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.data?.error_description ||
                        error.message ||
                        'Kategori ilişkisi oluşturulamadı'
    
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

