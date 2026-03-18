const hubspot = require('@hubspot/api-client');

// This tells the script to look at Render's "Secret Vault" instead of the text
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const hubspotClient = new hubspot.Client({ accessToken: HUBSPOT_TOKEN });

// IDs récupérés de tes captures d'écran
const MAP = {
    TO_NOTE: { contacts: 202, companies: 190, deals: 214 }, //
    LINKS: {
        contacts: { companies: 279, deals: 4 }, //
        companies: { contacts: 280, deals: 342 }, //
        deals: { contacts: 3, companies: 341 } //
    }
};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function start() {
    console.log("=== DÉMARRAGE DE LA SYNCHRO GLOBALE ===");
    try {
        const types = ['contacts', 'companies', 'deals'];

        for (const type of types) {
            console.log(`\n--- Analyse des ${type} ---`);
            // On crée une requête de recherche pour trier par les fiches les plus récemment modifiées
const searchRequest = {
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
    limit: 20
};
const response = await hubspotClient.crm[type].searchApi.doSearch(searchRequest);
            
            for (const obj of response.results) {
		await sleep(150); // Pause de 150 millisecondes pour ne pas froisser HubSpot
                // 1. On cherche les notes présentes sur cette fiche
                const noteAssocs = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, 'notes');
                
                if (noteAssocs.results.length > 0) {
                    console.log(`📍 Fiche ${type} ${obj.id} : ${noteAssocs.results.length} note(s) à vérifier.`);

                    // 2. Pour chaque note, on cherche les autres fiches liées (Contacts, Entreprises ou Deals)
                    for (const note of noteAssocs.results) {
                        for (const targetType of types) {
                            if (targetType === type) continue; // Pas besoin de copier sur soi-même

                            // On utilise les IDs de tes captures pour trouver les fiches liées
                            await sleep(200);
							const linkedObjs = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, targetType);
                            
                            for (const linkedObj of linkedObjs.results) {
                                try {
									await sleep(200);
                                    await hubspotClient.crm.associations.v4.batchApi.create('notes', targetType, {
                                        inputs: [{
                                            _from: { id: note.toObjectId },
                                            to: { id: linkedObj.toObjectId },
                                            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: MAP.TO_NOTE[targetType] }]
                                        }]
                                    });
                                    console.log(`   ✨ Note ${note.toObjectId} synchronisée vers ${targetType} ${linkedObj.toObjectId}`);
                                } catch (e) {
                                    // Déjà lié, on ignore proprement
                                }
                            }
                        }
                    }
                }
            }
        }
        console.log("\n=== TERMINÉ : TOUTES LES FICHES SONT À JOUR ===");
    } catch (err) {
        console.error("❌ ERREUR : " + err.message);
    }
}

// Lance le cycle automatique
console.log("=== MODE SENTINELLE ACTIVÉ (Scan toutes les 20s) ===");
setInterval(start, 20000);
start();

