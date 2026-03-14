const http = require('http');

// This line silently launches your untouched HubSpot script in the background
require('./hubspot_sync.js'); 

// This line creates the dummy "Web Server" Render demands for the Free Tier
http.createServer((req, res) => res.end('Sentinel is alive')).listen(process.env.PORT || 3000);
