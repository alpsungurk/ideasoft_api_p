// Supabase Edge Function - Ideasoft Categories
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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  const url = new URL(req.url)
  const { shopId, accessToken, categoryId } = req.method === 'GET' 
    ? Object.fromEntries(url.searchParams.entries())
    : await req.json()

  if (!shopId || !accessToken) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Shop ID ve Access Token gerekli' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    let apiUrl
    if (categoryId) {
      // Tek kategori getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories/${categoryId}`
    } else {
      // Tüm kategorileri getir
      apiUrl = `https://${shopId}.myideasoft.com/admin-api/categories`
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    const responseData = await response.json()

    // Response data'yı kontrol et
    let categoriesList: any[] = []
    if (categoryId) {
      // Tek kategori döndür
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
    } else {
      // Tüm kategoriler
      if (Array.isArray(responseData)) {
        categoriesList = responseData
      } else if (responseData && Array.isArray(responseData.items)) {
        categoriesList = responseData.items
      } else if (responseData && Array.isArray(responseData.categories)) {
        categoriesList = responseData.categories
      } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
        categoriesList = responseData.data
      }

      // Status 1 olanları filtrele (1 = Aktif)
      const activeCategories = categoriesList.filter((cat: any) => cat.status === 1)

      // Parent name'leri de ekle
      const categoriesWithParent = activeCategories.map((cat: any) => ({
        ...cat,
        parentName: cat.parent?.name || null,
        parentId: cat.parent?.id || null
      }))

      return new Response(
        JSON.stringify({
          success: true,
          data: categoriesWithParent,
          total: categoriesList.length,
          active: activeCategories.length
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }
  } catch (error: any) {
    console.error('Categories API Error:', error)
    const errorMessage = error.message || 'Kategoriler alınamadı'
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

