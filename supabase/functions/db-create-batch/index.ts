// Supabase Edge Function - Create new batch and save products
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const body = await req.json()
    const { products, projectName } = body

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ürün listesi boş' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (!projectName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Proje ismi gerekli' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Aynı SKU kontrolü (aynı SKU'lar ileride status güncellemelerinde birbirini ezer)
    const skuCounts = new Map()
    for (const p of products) {
      const sku = String(p?.sku || '').trim()
      if (!sku) continue
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1)
    }
    const duplicateSkus = [...skuCounts.entries()].filter(([, c]) => c > 1).map(([sku]) => sku)
    if (duplicateSkus.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Aynı SKU'dan ürünler var: ${duplicateSkus.join(', ')}. Lütfen Excel dosyanızı kontrol edip tekilleştirin.`,
          duplicateSkus
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 1. Batch oluştur
    const { data: batch, error: batchError } = await supabaseClient
      .from('import_batches')
      .insert({
        name: projectName,
        total_products: products.length,
        status: 'PROCESSING'
      })
      .select()
      .single()

    if (batchError) {
      throw batchError
    }

    const batchId = batch.id

    // 2. Ürünleri ekle
    const productsToInsert = products.map((p: any) => ({
      batch_id: batchId,
      sku: String(p.sku || '').trim(),
      manufacturer_code: String(p.manufacturerCode || p.manufacturer_code || '').trim(),
      name: String(p.name || '').trim(),
      price: Number(p.price ?? p.price1 ?? 0) || 0,
      stock_amount: Number(p.stock ?? p.stockAmount ?? p.stock_amount ?? 0) || 0,
      description: String(p.description || '').trim(),
      image_url: String(p.image || p.imageUrl || p.image_url || '').trim(),
      brand: String(p.brand || '').trim(),
      category_xml_name: String(p.category || p.category_xml_name || '').trim(),
      selected_category_id: (p.categoryId === undefined || p.categoryId === null || p.categoryId === '')
        ? null
        : Number(p.categoryId),
      ideasoft_category_name: (p.categoryName === undefined || p.categoryName === null || p.categoryName === '')
        ? null
        : String(p.categoryName),
      status: 0,
      transfer_status: 'PENDING'
    }))

    const { error: productsError } = await supabaseClient
      .from('imported_products')
      .insert(productsToInsert)

    if (productsError) {
      throw productsError
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Proje oluşturuldu',
        batchId: batchId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Batch Create Error:', error)
    const msg = error?.message || 'Batch create failed'
    return new Response(
      JSON.stringify({
        success: false,
        error: msg,
        code: error?.code
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

