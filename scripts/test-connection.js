require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Clés manquantes dans .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('🔍 Test de connexion avec la clé service_role...');

  // Test 1 : Lecture de la table provinces
  const { data: selectData, error: selectError } = await supabase
    .from('provinces')
    .select('*')
    .limit(1);
  if (selectError) {
    console.error('❌ Erreur SELECT :', selectError);
  } else {
    console.log('✅ SELECT réussi, données :', selectData);
  }

  // Test 2 : Insertion d'une province temporaire (on la supprimera après)
  const { data: insertData, error: insertError } = await supabase
    .from('provinces')
    .insert({ nom: 'Test Province' })
    .select();
  if (insertError) {
    console.error('❌ Erreur INSERT :', insertError);
  } else {
    console.log('✅ INSERT réussi, id :', insertData[0].id);
    // Nettoyage
    await supabase.from('provinces').delete().eq('id', insertData[0].id);
    console.log('🗑️ Test nettoyé');
  }
}

test();