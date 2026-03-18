const hubspot = require('@hubspot/api-client');

// This tells the script to look at Render's "Secret Vault" instead of the text
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const hubspotClient = new hubspot.Client({ accessToken: HUBSPOT_TOKEN });
if (!HUBSPOT_TOKEN) {
    console.error("❌ ERREUR : Ton PC ne trouve pas la variable d'environnement HUBSPOT_TOKEN.");
    console.error("Tape cette commande avant de lancer le script : $env:HUBSPOT_TOKEN='ton_token_ici'");
    process.exit(1);
}

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
	const sinceTimestamp = Date.now() - (2 * 60 * 1000); //2min en millisec
	console.log(`--- Scan des modifs depuis : ${new Date(sinceTimestamp).toLocaleTimeString()}---`);
    try {
        const types = ['contacts', 'companies', 'deals'];

        for (const type of types) {
            console.log(`\n--- Analyse des ${type} ---`);
            // On crée une requête de recherche pour trier par les fiches les plus récemment modifiées
const searchRequest = {
	filterGroups: [{
		filters: [{
			propertyName: 'hs_lastmodifieddate',
			operator: 'GTE',
			value: sinceTimestamp.toString()
		}]
	}],
	limit: 50
};

const response = await hubspotClient.crm[type].searchApi.doSearch(searchRequest);

if (!response.results || response.results.length === 0) {
                console.log(`   > Rien de neuf pour ${type}.`);
                continue;
}
		
            for (const obj of response.results) {
		await sleep(250); // Délai de sécurité
                // 1. On cherche les notes présentes sur cette fiche
                const noteAssocs = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, 'notes');
                
                if (noteAssocs.results.length > 0) {
                    console.log(`📍 Fiche ${type} ${obj.id} : ${noteAssocs.results.length} note(s) à vérifier.`);

                    // 2. Pour chaque note, on cherche les autres fiches liées (Contacts, Entreprises ou Deals)
                    for (const note of noteAssocs.results) {
                        for (const targetType of types) {
                            if (targetType === type) continue; // Pas besoin de copier sur soi-même

                            // On utilise les IDs de tes captures pour trouver les fiches liées
							const linkedObjs = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, targetType);
                            
                            for (const linkedObj of linkedObjs.results) {
                                try {
                                    await hubspotClient.crm.associations.v4.batchApi.create('notes', targetType, {
                                        inputs: [{
                                            _from: { id: note.toObjectId },
                                            to: { id: linkedObj.toObjectId },
                                            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: MAP.TO_NOTE[targetType] }]
                                        }]
                                    });
                                    console.log(` ✨ Note ${note.toObjectId} synchronisée vers ${targetType}`);
                                } catch (e) {/*Déjà lié, on ignore proprement*/}
                            }
                        }
                    }
                }
            }
        }
        console.log("\n=== CYCLE DE SCAN TERMINE ===");
    } catch (error) {
        if (error.message && error.message.includes('429')) {
            console.error(`\n🚦 Limite de vitesse HubSpot (429). Pause de 10s...`);
            await sleep(10000);
        } else {
            console.error("\n❌ LA VRAIE ERREUR EST :", error.message);
            process.exit(1); 
        }
    }
}

// Lance le cycle automatique
console.log("=== MODE SENTINELLE ACTIVÉ ECO (Scan toutes les 2min) ===");
setInterval(start, 120000);
start();
