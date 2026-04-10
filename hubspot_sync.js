const hubspot = require('@hubspot/api-client');

// This tells the script to look at Render's "Secret Vault" instead of the text
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
if (!HUBSPOT_TOKEN) {
    console.error("❌ ERREUR : La variable d'environnement HUBSPOT_TOKEN est introuvable.");
    process.exit(1); 
}
// 3. On affiche la preuve dans les logs Render
console.log(`🔑 Token détecté ! Début du token : ${HUBSPOT_TOKEN.substring(0, 10)}...`);

const hubspotClient = new hubspot.Client({ accessToken: HUBSPOT_TOKEN });

// Affiche les 10 premiers caractères du token pour vérifier qu'il est bien lu sans le dévoiler en entier
console.log(`🔑 Token chargé : ${HUBSPOT_TOKEN.substring(0, 10)}...`);

// IDs récupérés de tes captures d'écran
const MAP = {
    TO_NOTE: { contacts: 202, companies: 190, deals: 214 }, //
    LINKS: {
        contacts: { companies: 279, deals: 4 }, //
        companies: { contacts: 280, deals: 342 }, //
        deals: { contacts: 3, companies: 341 } //
    }
};

const FORBIDDEN_PIPELINE_ID = '2510979314';
const FORBIDDEN_WORDS = [
	'invest',
	'investissement',
	'ouverture du capital',
	'levée de fonds',
	'last push invest'
];

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

if (type === 'companies') {
	searchRequest.filterGroups[0].filters.push({
		propertyName: 'verticale',
		operator: 'NEQ',
		value: 'GMS'
	});
}

if (type === 'deals') {
	searchRequest.filterGroups[0].filters.push({
		propertyName: 'pipeline',
		operator: 'EQ',
		value: 'default'
	});
};

const response = await hubspotClient.crm[type].searchApi.doSearch(searchRequest);

if (!response.results || response.results.length === 0) {
                console.log(`   > Rien de neuf pour ${type}.`);
                continue;
}
		
            for (const obj of response.results) {
		await sleep(250); // Délai de sécurité

				// 🛑 LE RADAR ANTI-LEVÉE DE FONDS (Pour Contacts et Entreprises)
    if (type === 'contacts' || type === 'companies') {
        try {
            // On regarde si la fiche a des deals associés
            const dealsLinked = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, 'deals');
            if (dealsLinked.results.length > 0) {
                // On récupère les propriétés de ces deals en une seule requête rapide
                const dealIds = dealsLinked.results.map(d => ({ id: String(d.toObjectId) }));
                const dealsData = await hubspotClient.crm.deals.batchApi.read({ inputs: dealIds, properties: ['pipeline'] });
                
                // On vérifie si au moins un des deals est dans la pipeline Levée de fonds (2510979314)
                const isForbidden = dealsData.results.some(d => d.properties.pipeline === FORBIDDEN_PIPELINE_ID);
                if (isForbidden) {
                    console.log(`   > 🚫 Fiche ${type} ${obj.id} ignorée (associée à Levée de fonds).`);
                    continue; // On passe directement à la fiche suivante
                }
            }
        } catch (e) {
            console.error(`⚠️ Impossible de vérifier la pipeline des deals pour ${type} ${obj.id}`);
        }
    }	
    // 1. On cherche les notes présentes sur les fiches non ignorées
    const noteAssocs = await hubspotClient.crm.associations.v4.basicApi.getPage(type, obj.id, 'notes');
                
    if (noteAssocs.results.length > 0) {
    console.log(`📍 Fiche ${type} ${obj.id} : ${noteAssocs.results.length} note(s) à vérifier.`);

	// 🤫 RADAR 2 : MOTS-CLÉS CONFIDENTIELS DANS LES NOTES
    try {
        const noteIds = noteAssocs.results.map(n => ({ id: String(n.toObjectId) }));
        const notesData = await hubspotClient.crm.objects.notes.batchApi.read({ inputs: noteIds, properties: ['hs_note_body'] });
        
        // On vérifie si l'une des notes contient un mot interdit
        const hasInvestmentNote = notesData.results.some(n => {
            if (!n.properties.hs_note_body) return false;
            const body = n.properties.hs_note_body.toLowerCase(); 
            return FORBIDDEN_WORDS.some(word => body.includes(word));
        });

        if (hasInvestmentNote) {
            console.log(`   > 🤫 Fiche ${type} ${obj.id} ignorée (Contient des notes d'investissement).`);
            continue; // On passe à la fiche suivante sans synchroniser les notes
        }
    } catch (e) {
        console.error(`⚠️ Impossible de lire le contenu des notes pour ${type} ${obj.id}`);
    }

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
