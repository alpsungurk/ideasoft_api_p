// Supabase Edge Function - Ideasoft Get Products Batch
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
  const { shopId, accessToken, productIds } = body

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

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'productIds array gerekli' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }

  try {
    const uniqueIds = [...new Set(productIds.map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 50)
    const results: any = {}

    for (const id of uniqueIds) {
      try {
        const apiUrl = `https://${shopId}.myideasoft.com/admin-api/products/${id}`
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          results[id] = { success: true, data }
        } else {
          const errorData = await response.json().catch(() => ({}))
          const msg = errorData?.message || errorData?.error || 'Ürün alınamadı'
          results[id] = { success: false, error: msg, statusCode: response.status }
        }
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Ürün alınamadı'
        results[id] = { success: false, error: msg, statusCode: e?.response?.status }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { results }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error: any) {
    console.error('Get Products Batch Error:', error)
    const errorMessage = error.message || 'Toplu ürün çekme hatası'
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


