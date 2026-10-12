// scripts/import-locations.js
require('dotenv').config({ path: '.env.local' }); // Charge les variables d'environnement depuis .env.local

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Erreur : Variables d\'environnement NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  console.error('Vérifiez votre fichier .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importLocations() {
  const provinces = {};
  const villes = {};
  const communes = [];

  fs.createReadStream('data/provinces_villes_communes.csv')
    .pipe(csv())
    .on('data', (row) => {
      const provinceNom = row.province.trim();
      const villeNom = row.ville.trim();
      const communeNom = row.commune.trim();

      if (!provinces[provinceNom]) {
        provinces[provinceNom] = { id: null, nom: provinceNom };
      }

      const villeKey = `${provinceNom}|${villeNom}`;
      if (!villes[villeKey]) {
        villes[villeKey] = { id: null, nom: villeNom, provinceNom };
      }

      communes.push({
        nom: communeNom,
        villeKey,
      });
    })
    .on('end', async () => {
      console.log('📄 CSV lu, insertion des données...');

      // Insérer les provinces
      for (const province of Object.values(provinces)) {
        const { data, error } = await supabase
          .from('provinces')
          .insert({ nom: province.nom })
          .select();
        if (error) {
          console.error(`❌ Erreur province ${province.nom}:`, error.message);
        } else {
          province.id = data[0].id;
          console.log(`✅ Province insérée: ${province.nom} (id: ${province.id})`);
        }
      }

      // Insérer les villes
      for (const [key, ville] of Object.entries(villes)) {
        const province = Object.values(provinces).find(p => p.nom === ville.provinceNom);
        if (!province) continue;
        const { data, error } = await supabase
          .from('villes')
          .insert({ nom: ville.nom, province_id: province.id })
          .select();
        if (error) {
          console.error(`❌ Erreur ville ${ville.nom}:`, error.message);
        } else {
          ville.id = data[0].id;
          console.log(`✅ Ville insérée: ${ville.nom} (id: ${ville.id})`);
        }
      }

      // Insérer les communes
      for (const commune of communes) {
        const ville = villes[commune.villeKey];
        if (!ville) continue;
        const { error } = await supabase
          .from('communes')
          .insert({ nom: commune.nom, ville_id: ville.id });
        if (error) {
          console.error(`❌ Erreur commune ${commune.nom}:`, error.message);
        } else {
          console.log(`✅ Commune insérée: ${commune.nom}`);
        }
      }

      console.log('🎉 Import terminé.');
    });
}

importLocations();