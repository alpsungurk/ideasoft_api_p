// Supabase Edge Function - Ideasoft Update Product
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

  // POST ve PUT metodlarını kabul et
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )
  }

  // URL'den product ID'yi al (PUT /api/ideasoft/products/:id formatı için)
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/')
  let productIdFromUrl = null
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1]
    const parsedId = parseInt(lastPart, 10)
    if (!isNaN(parsedId)) {
      productIdFromUrl = parsedId
    }
  }

  const body = await req.json().catch(() => ({}))
  const { shopId, accessToken, productId, productData } = body
  
  // URL'den gelen product ID'yi kullan (varsa)
  const finalProductId = productIdFromUrl || productId

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

  if (!finalProductId) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Product ID gerekli (URL veya body içinde)' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products/${finalProductId}`
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(productData)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData?.message || 
                          errorData?.error || 
                          errorData?.error_description ||
                          'Ideasoft ürün güncellenemedi'
      
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          statusCode: response.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status 
        }
      )
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
    console.error('Ideasoft Update Error:', error)
    const errorMessage = error.message || 'Ideasoft ürün güncellenemedi'
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


