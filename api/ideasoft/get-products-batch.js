// Vercel Serverless Function - Proxy to Supabase Edge Function
// Handles: POST /api/ideasoft/get-products-batch

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ljxbtkpognfqkdffecje.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shopId, accessToken, productIds } = req.body

  if (!shopId || !accessToken || !productIds) {
    return res.status(400).json({ 
      success: false,
      error: 'Shop ID, Access Token ve Product IDs gerekli' 
    })
  }

  try {
    // Call Supabase Edge Function
    const supabaseFunctionUrl = `${SUPABASE_URL}/functions/v1/ideasoft-get-products-batch`
    
    const response = await fetch(supabaseFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        shopId,
        accessToken,
        productIds
      })
    })

    const data = await response.json()
    
    return res.status(response.status).json(data)
  } catch (error) {
    console.error('Proxy Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Proxy hatası'
    })
  }
}

